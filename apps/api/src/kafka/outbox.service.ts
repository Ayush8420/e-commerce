import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from './kafka.service';

export interface EnqueueOutboxParams {
  aggregateType: string;
  aggregateId: string;
  topic: string;
  eventType: string;
  payload: Record<string, unknown>;
}

type PrismaExecutor = Prisma.TransactionClient | PrismaService;
export type OutboxFallbackHandler = (payload: Record<string, unknown>) => Promise<void>;

@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private pollTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;
  private dbBackoffUntil = 0;
  private readonly fallbackHandlers = new Map<string, OutboxFallbackHandler>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KafkaService) private readonly kafka: KafkaService,
  ) {}

  onModuleInit(): void {
    if (process.env.SKIP_INFRA_BOOT === 'true') {
      return;
    }
    this.scheduleNextPoll(5000);
  }

  onModuleDestroy(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private scheduleNextPoll(delayMs: number): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    this.pollTimer = setTimeout(() => {
      void this.flushPending();
    }, delayMs);
    this.pollTimer.unref();
  }

  async enqueue(executor: PrismaExecutor, params: EnqueueOutboxParams): Promise<void> {
    await executor.outboxEvent.create({
      data: {
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        topic: params.topic,
        eventType: params.eventType,
        payload: params.payload as Prisma.InputJsonValue,
        status: OutboxStatus.PENDING,
      },
    });
  }

  async enqueueMany(executor: PrismaExecutor, items: EnqueueOutboxParams[]): Promise<void> {
    if (items.length === 0) return;
    await executor.outboxEvent.createMany({
      data: items.map((params) => ({
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        topic: params.topic,
        eventType: params.eventType,
        payload: params.payload as Prisma.InputJsonValue,
        status: OutboxStatus.PENDING,
      })),
    });
  }

  registerFallbackHandler(topic: string, handler: OutboxFallbackHandler): void {
    this.fallbackHandlers.set(topic, handler);
  }

  triggerFlush(): void {
    if (process.env.SKIP_INFRA_BOOT === 'true') {
      return;
    }
    setImmediate(() => {
      void this.flushPending();
    });
  }

  async flushPending(): Promise<number> {
    if (this.isFlushing || Date.now() < this.dbBackoffUntil) {
      return 0;
    }
    this.isFlushing = true;
    let publishedCount = 0;

    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: { status: OutboxStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      this.dbBackoffUntil = 0;

      if (pending.length === 0) {
        // Long idle interval so Neon compute can scale to zero when there is no traffic
        this.scheduleNextPoll(300000);
        return 0;
      }

      const kafkaReady = await this.kafka.ensureConnected();
      if (!kafkaReady) {
        let fallbackDelivered = 0;
        for (const event of pending) {
          const fallback = this.fallbackHandlers.get(event.topic);
          if (!fallback) {
            continue;
          }
          try {
            await fallback(event.payload as Record<string, unknown>);
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: {
                status: OutboxStatus.PUBLISHED,
                publishedAt: new Date(),
                lastError: null,
              },
            });
            fallbackDelivered += 1;
          } catch (err) {
            this.logger.debug(
              `Direct outbox fallback skipped for ${event.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
        this.scheduleNextPoll(fallbackDelivered > 0 ? 3000 : 15000);
        return fallbackDelivered;
      }

      for (const event of pending) {
        try {
          await this.kafka.publish(
            event.topic,
            event.aggregateId,
            event.payload,
          );
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: OutboxStatus.PUBLISHED,
              publishedAt: new Date(),
              lastError: null,
            },
          });
          publishedCount += 1;
        } catch (error) {
          const attempts = event.attempts + 1;
          const message = error instanceof Error ? error.message : String(error);
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              attempts,
              lastError: message.slice(0, 500),
              status: attempts >= 10 ? OutboxStatus.FAILED : OutboxStatus.PENDING,
            },
          });
          this.logger.warn(`Outbox event ${event.id} publish attempt ${attempts} failed: ${message}`);
          break;
        }
      }
    } catch (error) {
      this.dbBackoffUntil = Date.now() + 15000;
      this.scheduleNextPoll(30000);
      this.logger.debug(
        `Outbox flush skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.isFlushing = false;
    }

    this.scheduleNextPoll(publishedCount > 0 ? 5000 : 30000);
    return publishedCount;
  }

  async getStats() {
    const [pending, published, failed, recent] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: OutboxStatus.PENDING } }),
      this.prisma.outboxEvent.count({ where: { status: OutboxStatus.PUBLISHED } }),
      this.prisma.outboxEvent.count({ where: { status: OutboxStatus.FAILED } }),
      this.prisma.outboxEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);

    return { pending, published, failed, recent };
  }

  async retryFailed(): Promise<number> {
    const result = await this.prisma.outboxEvent.updateMany({
      where: { status: OutboxStatus.FAILED },
      data: {
        status: OutboxStatus.PENDING,
        attempts: 0,
        lastError: null,
      },
    });
    this.triggerFlush();
    return result.count;
  }
}

