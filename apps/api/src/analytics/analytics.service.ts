import { Inject, Injectable } from '@nestjs/common';
import { AnalyticsEventPayload, KAFKA_TOPICS } from '@ecommerce/shared';
import { randomUUID } from 'crypto';
import { KafkaService } from '../kafka/kafka.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsConsumer } from './analytics.consumer';

export interface TrackEventInput {
  type: AnalyticsEventPayload['type'];
  userId?: string;
  sessionId?: string;
  query?: string;
  productId?: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(KafkaService) private readonly kafka: KafkaService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AnalyticsConsumer) private readonly consumer: AnalyticsConsumer,
  ) {}

  async track(input: TrackEventInput): Promise<void> {
    const event: AnalyticsEventPayload = {
      eventId: randomUUID(),
      type: input.type,
      userId: input.userId,
      sessionId: input.sessionId,
      query: input.query,
      productId: input.productId,
      orderId: input.orderId,
      metadata: input.metadata,
      occurredAt: new Date().toISOString(),
    };

    try {
      await this.kafka.publish(
        KAFKA_TOPICS.ANALYTICS_EVENTS,
        input.userId || input.sessionId || 'anon',
        event,
      );
    } catch {
      await this.consumer.persistEvent(event);
    }
  }

  async getSummary(days = 14) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [byType, topSearchesRaw, topViewedRaw, recentEvents] = await Promise.all([
      this.prisma.analyticsEvent.groupBy({
        by: ['type'],
        where: { occurredAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.analyticsEvent.groupBy({
        by: ['query'],
        where: {
          type: 'search.performed',
          query: { not: null },
          occurredAt: { gte: since },
        },
        _count: { query: true },
        orderBy: { _count: { query: 'desc' } },
        take: 10,
      }),
      this.prisma.analyticsEvent.groupBy({
        by: ['productId'],
        where: {
          type: 'product.viewed',
          productId: { not: null },
          occurredAt: { gte: since },
        },
        _count: { productId: true },
        orderBy: { _count: { productId: 'desc' } },
        take: 8,
      }),
      this.prisma.analyticsEvent.findMany({
        orderBy: { occurredAt: 'desc' },
        take: 25,
      }),
    ]);

    const productIds = topViewedRaw
      .map((row) => row.productId)
      .filter((id): id is string => Boolean(id));
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, title: true, slug: true, pricePaise: true },
        })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));

    return {
      countsByType: Object.fromEntries(byType.map((item) => [item.type, item._count._all])),
      topSearches: topSearchesRaw
        .filter((r) => Boolean(r.query))
        .map((r) => ({ query: r.query as string, count: r._count.query })),
      topViewedProducts: topViewedRaw.map((r) => ({
        productId: r.productId as string,
        views: r._count.productId,
        product: productById.get(r.productId as string) ?? null,
      })),
      recentEvents,
    };
  }
}

