import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AnalyticsEventPayload, KAFKA_TOPICS } from '@ecommerce/shared';
import { Prisma } from '@prisma/client';
import { KafkaService } from '../kafka/kafka.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsConsumer implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsConsumer.name);

  constructor(
    @Inject(KafkaService) private readonly kafka: KafkaService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafka.registerConsumer(
      'analytics-persister',
      KAFKA_TOPICS.ANALYTICS_EVENTS,
      async (payload) => {
        await this.persistEvent(payload as unknown as AnalyticsEventPayload);
      },
    );
  }

  async persistEvent(event: AnalyticsEventPayload): Promise<void> {
    if (!event?.eventId || !event?.type) {
      return;
    }

    try {
      await this.prisma.analyticsEvent.upsert({
        where: { eventId: event.eventId },
        create: {
          eventId: event.eventId,
          type: event.type,
          userId: event.userId ?? null,
          sessionId: event.sessionId ?? null,
          query: event.query ?? null,
          productId: event.productId ?? null,
          orderId: event.orderId ?? null,
          metadata: (event.metadata ?? {}) as Prisma.InputJsonValue,
          occurredAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
        },
        update: {},
      });
    } catch (error) {
      this.logger.warn(
        `Failed persisting analytics event ${event.eventId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

