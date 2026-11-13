import { Body, Controller, Get, Inject, Post, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import { KAFKA_TOPICS } from '@ecommerce/shared';
import { SystemActivityItem, SystemActivityService } from './system-activity.service';
import { OutboxService } from '../kafka/outbox.service';
import { KafkaService } from '../kafka/kafka.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('system')
export class SystemController {
  constructor(
    @Inject(SystemActivityService) private readonly activity: SystemActivityService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(KafkaService) private readonly kafka: KafkaService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Sse('stream')
  stream(): Observable<{ data: SystemActivityItem }> {
    return this.activity.getStream();
  }

  @Get('activity')
  async getActivity() {
    const recent = this.activity.getRecent();
    const outboxStats = await this.outbox.getStats().catch(() => null);
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      recent,
      outboxStats,
    };
  }

  @Get('kafka-metrics')
  async getKafkaMetrics() {
    return this.kafka.getConsumerLagMetrics();
  }

  @Post('stress-test')
  async runStressTest(
    @Body('concurrency') concurrency?: number,
    @Body('initialStock') initialStock?: number,
  ) {
    const n = Math.min(200, Math.max(10, concurrency ?? 100));
    const s = Math.min(50, Math.max(1, initialStock ?? 5));
    return this.activity.runStressTest(n, s);
  }

  @Post('flash-sale')
  async triggerFlashSale(
    @Body('productId') productId?: string,
    @Body('discountPercent') discountPercent = 20,
  ) {
    const pct = Math.min(50, Math.max(5, Number(discountPercent) || 20));
    let product;
    if (productId) {
      product = await this.prisma.product.findUnique({ where: { id: productId } });
    } else {
      product = await this.prisma.product.findFirst({
        where: { isActive: true },
        orderBy: { stock: 'desc' },
      });
    }

    if (!product) {
      throw new Error('No product found for flash sale');
    }

    const oldPricePaise = product.pricePaise;
    const compareAtPaise = product.compareAtPaise || oldPricePaise;
    const newPricePaise = Math.round(oldPricePaise * (1 - pct / 100));

    // Update in PostgreSQL
    const updated = await this.prisma.product.update({
      where: { id: product.id },
      data: {
        pricePaise: newPricePaise,
        compareAtPaise,
      },
      include: {
        category: true,
        inventories: { include: { store: true } },
      },
    });

    const activeInvs = (updated.inventories ?? []).filter((i) => i.quantity > 0);
    const availableCities = Array.from(new Set(activeInvs.map((i) => i.store.city.toLowerCase())));

    // Emit event through Transactional Outbox
    await this.outbox.enqueue(this.prisma, {
      aggregateType: 'product',
      aggregateId: updated.id,
      topic: KAFKA_TOPICS.CATALOG_EVENTS,
      eventType: 'product.price_changed',
      payload: {
        eventId: randomUUID(),
        type: 'product.price_changed',
        productId: updated.id,
        pricePaise: updated.pricePaise,
        compareAtPaise: updated.compareAtPaise,
        availableCities,
        occurredAt: new Date().toISOString(),
      },
    });

    this.outbox.triggerFlush();

    this.activity.record({
      service: 'Kafka',
      step: 'kafka_event_published',
      title: `⚡ Flash Sale Broadcast: ${updated.title} price dropped ${pct}% (₹${oldPricePaise / 100} -> ₹${newPricePaise / 100})`,
      details: {
        productId: updated.id,
        title: updated.title,
        oldPricePaise,
        newPricePaise,
        discountPercent: pct,
        topic: KAFKA_TOPICS.CATALOG_EVENTS,
      },
    });

    return {
      success: true,
      productId: updated.id,
      title: updated.title,
      oldPricePaise,
      newPricePaise,
      discountPercent: pct,
    };
  }
}

