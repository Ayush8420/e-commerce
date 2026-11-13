import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { OpenSearchService } from '../search/opensearch.service';
import { OrderConsumer } from '../orders/order.consumer';
import { CatalogConsumer } from '../search/catalog.consumer';
import { IdempotencyService } from '../kafka/idempotency.service';

function makeConfig(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    OPENSEARCH_NODE: 'http://127.0.0.1:19200',
    OPENSEARCH_PRODUCTS_INDEX: 'products_v1',
    ...overrides,
  };
  return {
    get: (key: string, fallback = '') => defaults[key] ?? fallback,
  } as unknown as ConfigService;
}

describe('Phase 2C & 2D: Search Fuzzy Typo Tolerance, City Availability & Consumer Idempotency', () => {
  it('handles spelling mistakes: "bluetoth", "samsng", "mobail" match the right products', async () => {
    // Simulated OpenSearch client responding with fuzzy multi_match results
    const openSearch = new OpenSearchService(
      makeConfig(),
      {
        product: { findMany: vi.fn(), count: vi.fn() },
      } as never,
    );

    // Mock client.search to simulate OpenSearch fuzzy execution
    (openSearch as any).client = {
      indices: { exists: vi.fn().mockResolvedValue({ body: true }) },
      search: vi.fn().mockImplementation(async ({ body }: any) => {
        const queryText = body?.query?.bool?.must?.[0]?.bool?.should?.[0]?.multi_match?.query ?? '';
        const lower = queryText.toLowerCase();

        let matchedProduct = null;
        if (lower.includes('bluetoth') || lower.includes('bluetooth')) {
          matchedProduct = {
            id: 'p_sony_anc',
            title: 'Sony WH-1000XM5 Wireless Noise Cancelling Bluetooth Headphones',
            brand: 'Sony',
            pricePaise: 2999000,
            availableCities: ['mumbai', 'pune', 'delhi', 'bengaluru'],
          };
        } else if (lower.includes('samsng') || lower.includes('samsung')) {
          matchedProduct = {
            id: 'p_samsung_s24',
            title: 'Samsung Galaxy S24 Ultra 5G AI Smartphone',
            brand: 'Samsung',
            pricePaise: 12999900,
            availableCities: ['mumbai', 'delhi', 'hyderabad'],
          };
        } else if (lower.includes('mobail') || lower.includes('mobile')) {
          matchedProduct = {
            id: 'p_mobile_holder',
            title: 'MagSafe Wireless Mobile Desk Stand and Charger',
            brand: 'Spigen',
            pricePaise: 249900,
            availableCities: ['pune', 'mumbai', 'kolkata'],
          };
        }

        return {
          body: {
            took: 4,
            hits: {
              total: matchedProduct ? 1 : 0,
              hits: matchedProduct ? [{ _source: matchedProduct }] : [],
            },
            aggregations: {
              categories: { buckets: [] },
              brands: { buckets: [] },
              cities: {
                buckets: [
                  { key: 'mumbai', doc_count: 10 },
                  { key: 'pune', doc_count: 8 },
                  { key: 'delhi', doc_count: 7 },
                  { key: 'bengaluru', doc_count: 6 },
                ],
              },
            },
          },
        };
      }),
    };

    // 1. "bluetoth" typo matches Bluetooth headphones
    const bluetoothRes = await openSearch.searchProducts({ q: 'bluetoth' });
    expect(bluetoothRes.total).toBe(1);
    expect(bluetoothRes.items[0].title).toContain('Bluetooth');
    expect(bluetoothRes.tookMs).toBe(4);

    // 2. "samsng" typo matches Samsung smartphone
    const samsungRes = await openSearch.searchProducts({ q: 'samsng' });
    expect(samsungRes.total).toBe(1);
    expect(samsungRes.items[0].brand).toBe('Samsung');

    // 3. "mobail" typo matches Mobile accessories
    const mobileRes = await openSearch.searchProducts({ q: 'mobail' });
    expect(mobileRes.total).toBe(1);
    expect(mobileRes.items[0].title).toContain('Mobile');
  });

  it('filters search results by city availability and returns city facet aggregation counts', async () => {
    const openSearch = new OpenSearchService(
      makeConfig(),
      {
        product: { findMany: vi.fn(), count: vi.fn() },
      } as never,
    );

    let capturedFilter: any = null;
    (openSearch as any).client = {
      indices: { exists: vi.fn().mockResolvedValue({ body: true }) },
      search: vi.fn().mockImplementation(async ({ body }: any) => {
        capturedFilter = body?.query?.bool?.filter;
        return {
          body: {
            took: 2,
            hits: { total: 2, hits: [] },
            aggregations: {
              categories: { buckets: [] },
              brands: { buckets: [] },
              cities: {
                buckets: [
                  { key: 'mumbai', doc_count: 15 },
                  { key: 'pune', doc_count: 12 },
                  { key: 'delhi', doc_count: 10 },
                ],
              },
            },
          },
        };
      }),
    };

    const result = await openSearch.searchProducts({ city: 'mumbai' });
    expect(result.facets.cities.length).toBe(3);
    expect(result.facets.cities[0].key).toBe('mumbai');
    expect(result.facets.cities[0].label).toBe('Mumbai');

    // Verify filter was applied to OpenSearch search body
    const cityFilter = capturedFilter?.find((f: any) => f.term?.availableCities);
    expect(cityFilter?.term?.availableCities).toBe('mumbai');
  });

  it('idempotency: replaying an order event does not duplicate outbox records or side-effects', async () => {
    const processedEvents = new Set<string>();
    const idempotencyService = {
      isEventProcessed: vi.fn().mockImplementation((group: string, eventId: string) => {
        return Promise.resolve(processedEvents.has(`${group}:${eventId}`));
      }),
      markEventProcessed: vi.fn().mockImplementation((group: string, eventId: string) => {
        processedEvents.add(`${group}:${eventId}`);
        return Promise.resolve(true);
      }),
    } as unknown as IdempotencyService;

    const outboxEnqueue = vi.fn().mockResolvedValue(undefined);
    const triggerFlush = vi.fn();
    const analyticsTrack = vi.fn().mockResolvedValue(undefined);

    const prismaMock = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'ord_123',
          orderNumber: 'ORD-123',
          totalPaise: 499900,
          user: { id: 'usr_1', email: 'priya@example.com', name: 'Priya' },
          items: [],
        }),
      },
    };

    const consumer = new OrderConsumer(
      { registerConsumer: vi.fn() } as never,
      prismaMock as never,
      { enqueue: outboxEnqueue, triggerFlush } as never,
      { track: analyticsTrack } as never,
      idempotencyService,
    );

    const event = {
      eventId: 'evt_order_paid_999',
      type: 'order.payment_succeeded' as const,
      orderId: 'ord_123',
      occurredAt: new Date().toISOString(),
    };

    // First delivery: should process normally
    await consumer.handleOrderEvent(event);
    expect(outboxEnqueue).toHaveBeenCalledTimes(1);
    expect(analyticsTrack).toHaveBeenCalledTimes(1);

    // Replay / duplicate delivery: must be skipped cleanly!
    await consumer.handleOrderEvent(event);
    expect(outboxEnqueue).toHaveBeenCalledTimes(1); // STILL 1!
    expect(analyticsTrack).toHaveBeenCalledTimes(1); // STILL 1!
  });

  it('idempotency: replaying a catalog.events message is skipped cleanly', async () => {
    const processedEvents = new Set<string>();
    const idempotencyService = {
      isEventProcessed: vi.fn().mockImplementation((group: string, eventId: string) => {
        return Promise.resolve(processedEvents.has(`${group}:${eventId}`));
      }),
      markEventProcessed: vi.fn().mockImplementation((group: string, eventId: string) => {
        processedEvents.add(`${group}:${eventId}`);
        return Promise.resolve(true);
      }),
    } as unknown as IdempotencyService;

    const syncProductById = vi.fn().mockResolvedValue(undefined);
    const consumer = new CatalogConsumer(
      { registerConsumer: vi.fn() } as never,
      { syncProductById } as never,
      { deleteProduct: vi.fn() } as never,
      idempotencyService,
    );

    const catalogEvent = {
      eventId: 'cat_evt_111',
      type: 'product.stock_changed' as const,
      productId: 'prod_1',
      occurredAt: new Date().toISOString(),
    };

    // First delivery
    await consumer.handleCatalogEvent(catalogEvent);
    expect(syncProductById).toHaveBeenCalledTimes(1);

    // Replay / duplicate delivery
    await consumer.handleCatalogEvent(catalogEvent);
    expect(syncProductById).toHaveBeenCalledTimes(1); // Skipped duplicate!
  });
});
