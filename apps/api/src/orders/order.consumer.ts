import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { KAFKA_TOPICS, OrderEventPayload } from '@ecommerce/shared';
import { AnalyticsService } from '../analytics/analytics.service';
import { IdempotencyService } from '../kafka/idempotency.service';
import { KafkaService } from '../kafka/kafka.service';
import { OutboxService } from '../kafka/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemActivityService } from '../system/system-activity.service';

@Injectable()
export class OrderConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderConsumer.name);

  constructor(
    @Inject(KafkaService) private readonly kafka: KafkaService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Optional()
    @Inject(SystemActivityService)
    private readonly activity?: SystemActivityService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.outbox.registerFallbackHandler(KAFKA_TOPICS.ORDER_EVENTS, async (payload) => {
      await this.handleOrderEvent(
        payload as unknown as OrderEventPayload & { utrNumber?: string; reason?: string },
      );
    });

    await this.kafka.registerConsumer('order-workflow', KAFKA_TOPICS.ORDER_EVENTS, async (payload) => {
      await this.handleOrderEvent(payload as unknown as OrderEventPayload & { utrNumber?: string; reason?: string });
    });
  }

  async handleOrderEvent(
    event: OrderEventPayload & { utrNumber?: string; reason?: string },
  ): Promise<void> {
    if (!event?.orderId || !event?.type) {
      return;
    }

    if (event.eventId) {
      const alreadyProcessed = await this.idempotency.isEventProcessed(
        'order-workflow',
        event.eventId,
      );
      if (alreadyProcessed) {
        this.logger.debug(
          `[Idempotency] Skipping duplicate order event ${event.eventId} (${event.type})`,
        );
        return;
      }
    }

    const order = await this.prisma.order.findUnique({
      where: { id: event.orderId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        items: true,
      },
    });
    if (!order || !order.user?.email) {
      return;
    }

    this.logger.debug(`Processing order event ${event.type} for ${order.orderNumber}`);
    this.activity?.record({
      service: 'Kafka',
      step: 'kafka_consumer_received',
      title: `OrderConsumer processed ${event.type} for ${order.orderNumber}`,
      details: {
        group: 'order-workflow',
        orderId: order.id,
        orderNumber: order.orderNumber,
        type: event.type,
      },
    });

    if (event.type === 'order.payment_succeeded') {
      await this.outbox.enqueue(this.prisma, {
        aggregateType: 'Order',
        aggregateId: order.id,
        topic: KAFKA_TOPICS.NOTIFICATION_EVENTS,
        eventType: 'email.order_confirmed',
        payload: {
          eventId: `notif-${event.eventId}`,
          type: 'email.order_confirmed',
          to: order.user.email,
          userId: order.user.id,
          subject: `Order Confirmed: ${order.orderNumber}`,
          data: {
            name: order.user.name,
            orderId: order.id,
            orderNumber: order.orderNumber,
            totalPaise: order.totalPaise,
            utrNumber: event.utrNumber ?? null,
            items: order.items.map((i) => ({
              title: i.titleSnapshot,
              quantity: i.quantity,
              pricePaise: i.pricePaise,
            })),
          },
          occurredAt: new Date().toISOString(),
        },
      });
      this.outbox.triggerFlush();

      await this.analytics.track({
        type: 'order.completed',
        userId: order.user.id,
        orderId: order.id,
        metadata: {
          orderNumber: order.orderNumber,
          totalPaise: order.totalPaise,
        },
      });

      if (event.eventId) {
        await this.idempotency.markEventProcessed('order-workflow', event.eventId, event.type);
      }
      return;
    }

    if (event.type === 'order.payment_failed') {
      await this.outbox.enqueue(this.prisma, {
        aggregateType: 'Order',
        aggregateId: order.id,
        topic: KAFKA_TOPICS.NOTIFICATION_EVENTS,
        eventType: 'email.payment_failed',
        payload: {
          eventId: `notif-${event.eventId}`,
          type: 'email.payment_failed',
          to: order.user.email,
          userId: order.user.id,
          subject: `Payment Failed for Order ${order.orderNumber}`,
          data: {
            name: order.user.name,
            orderId: order.id,
            orderNumber: order.orderNumber,
            reason: event.reason ?? 'UPI payment could not be verified.',
          },
          occurredAt: new Date().toISOString(),
        },
      });
      this.outbox.triggerFlush();

      if (event.eventId) {
        await this.idempotency.markEventProcessed('order-workflow', event.eventId, event.type);
      }
      return;
    }

    if (event.type === 'order.status_updated' || event.type === 'order.cancelled') {
      await this.outbox.enqueue(this.prisma, {
        aggregateType: 'Order',
        aggregateId: order.id,
        topic: KAFKA_TOPICS.NOTIFICATION_EVENTS,
        eventType: 'email.order_status_updated',
        payload: {
          eventId: `notif-${event.eventId}`,
          type: 'email.order_status_updated',
          to: order.user.email,
          userId: order.user.id,
          subject: `Order ${order.orderNumber} is now ${event.status}`,
          data: {
            name: order.user.name,
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: event.status,
          },
          occurredAt: new Date().toISOString(),
        },
      });
      this.outbox.triggerFlush();

      if (event.eventId) {
        await this.idempotency.markEventProcessed('order-workflow', event.eventId, event.type);
      }
    }
  }
}

