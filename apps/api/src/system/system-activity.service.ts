import { Inject, Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface SystemActivityItem {
  id: string;
  timestamp: string;
  service: 'PostgreSQL' | 'Kafka' | 'OpenSearch' | 'Email';
  step:
    | 'order_saved_postgres'
    | 'kafka_event_published'
    | 'kafka_consumer_received'
    | 'opensearch_doc_indexed'
    | 'email_notification_sent'
    | 'stress_test_attempt';
  title: string;
  details: Record<string, unknown>;
  durationMs?: number;
}

export interface StressTestResult {
  productTitle: string;
  storeName: string;
  city: string;
  initialStock: number;
  totalAttempts: number;
  successfulPurchases: number;
  soldOutRejections: number;
  finalStock: number;
  oversold: boolean;
  durationMs: number;
  breakdown: Array<{ attempt: number; success: boolean; latencyMs: number; error?: string }>;
}

@Injectable()
export class SystemActivityService {
  private readonly logger = new Logger(SystemActivityService.name);
  private readonly events$ = new Subject<SystemActivityItem>();
  private readonly buffer: SystemActivityItem[] = [];
  private readonly maxBufferSize = 100;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    // Seed initial informational event
    this.record({
      service: 'PostgreSQL',
      step: 'order_saved_postgres',
      title: 'AetherMart Activity Monitoring Initialized',
      details: { status: 'listening', cluster: 'Aiven Cloud Ready' },
    });
  }

  record(item: Omit<SystemActivityItem, 'id' | 'timestamp'>): SystemActivityItem {
    const fullItem: SystemActivityItem = {
      ...item,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    this.buffer.unshift(fullItem);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.pop();
    }

    this.events$.next(fullItem);
    return fullItem;
  }

  getRecent(): SystemActivityItem[] {
    return [...this.buffer];
  }

  getStream(): Observable<{ data: SystemActivityItem }> {
    return this.events$.asObservable().pipe(
      map((item) => ({
        data: item,
      })),
    );
  }

  async runStressTest(concurrency = 100, initialStock = 5): Promise<StressTestResult> {
    const startTime = Date.now();
    const testSku = 'STRESS-TEST-XM5';

    // 1. Find or create a dedicated stress-test store & product
    let store = await this.prisma.store.findFirst({
      where: { city: { equals: 'Mumbai', mode: 'insensitive' }, isActive: true },
    });
    if (!store) {
      store = await this.prisma.store.findFirst({ where: { isActive: true } });
    }
    if (!store) {
      throw new Error('No active store available for stress testing.');
    }

    let product = await this.prisma.product.findUnique({
      where: { sku: testSku },
    });
    if (!product) {
      const category = await this.prisma.category.findFirst();
      if (!category) throw new Error('No categories found.');
      product = await this.prisma.product.create({
        data: {
          sku: testSku,
          title: 'Sony WH-1000XM5 (Stress Test Edition)',
          slug: 'sony-wh-1000xm5-stress-test',
          description: 'Limited edition high-demand flagship wireless noise cancelling headphones.',
          brand: 'Sony',
          pricePaise: 2999000,
          stock: initialStock,
          categoryId: category.id,
          isActive: true,
        },
      });
    }

    // Reset stock to exact initialStock for the test run
    await this.prisma.inventory.upsert({
      where: {
        productId_storeId: { productId: product.id, storeId: store.id },
      },
      create: {
        productId: product.id,
        storeId: store.id,
        quantity: initialStock,
      },
      update: {
        quantity: initialStock,
      },
    });

    await this.prisma.product.update({
      where: { id: product.id },
      data: { stock: initialStock },
    });

    this.record({
      service: 'PostgreSQL',
      step: 'stress_test_attempt',
      title: `Starting Oversell Stress Test (${concurrency} attempts vs ${initialStock} units)`,
      details: { sku: testSku, store: store.name, initialStock, concurrency },
    });

    // 2. Fire concurrent atomic purchase transactions directly
    const attempts = Array.from({ length: concurrency }, (_, i) => i + 1);
    const breakdown: StressTestResult['breakdown'] = [];
    let successfulPurchases = 0;
    let soldOutRejections = 0;

    await Promise.all(
      attempts.map(async (attemptNumber) => {
        const attemptStart = Date.now();
        try {
          // Execute single atomic conditional UPDATE
          const updated = await this.prisma.inventory.updateMany({
            where: {
              productId: product.id,
              storeId: store.id,
              quantity: { gte: 1 },
            },
            data: {
              quantity: { decrement: 1 },
            },
          });

          const latencyMs = Date.now() - attemptStart;
          if (updated.count === 1) {
            successfulPurchases += 1;
            breakdown.push({ attempt: attemptNumber, success: true, latencyMs });
          } else {
            soldOutRejections += 1;
            breakdown.push({
              attempt: attemptNumber,
              success: false,
              latencyMs,
              error: 'Sold Out (0 rows affected in conditional UPDATE)',
            });
          }
        } catch (err) {
          const latencyMs = Date.now() - attemptStart;
          soldOutRejections += 1;
          breakdown.push({
            attempt: attemptNumber,
            success: false,
            latencyMs,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );

    // Read final stock from PostgreSQL
    const finalInv = await this.prisma.inventory.findUnique({
      where: {
        productId_storeId: { productId: product.id, storeId: store.id },
      },
    });
    const finalStock = finalInv?.quantity ?? 0;

    // Sync product total stock
    await this.prisma.product.update({
      where: { id: product.id },
      data: { stock: Math.max(0, finalStock) },
    });

    const durationMs = Date.now() - startTime;
    const oversold = finalStock < 0;

    this.record({
      service: 'PostgreSQL',
      step: 'stress_test_attempt',
      title: `Stress Test Finished: ${successfulPurchases} won, ${soldOutRejections} rejected, final stock = ${finalStock}`,
      details: {
        concurrency,
        initialStock,
        successfulPurchases,
        soldOutRejections,
        finalStock,
        oversold,
        durationMs,
      },
      durationMs,
    });

    return {
      productTitle: product.title,
      storeName: store.name,
      city: store.city,
      initialStock,
      totalAttempts: concurrency,
      successfulPurchases,
      soldOutRejections,
      finalStock,
      oversold,
      durationMs,
      breakdown,
    };
  }
}

