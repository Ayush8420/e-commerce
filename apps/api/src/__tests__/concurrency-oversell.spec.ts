import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { OutboxService } from '../kafka/outbox.service';
import { AnalyticsService } from '../analytics/analytics.service';

describe('Phase 2B: Concurrency & Oversell Protection', () => {
  it('fires 100 concurrent purchases at an item with 5 units: exactly 5 succeed and stock never goes negative', async () => {
    // Shared state simulating PostgreSQL table with atomic row locks / conditional UPDATEs
    let storeInventoryStock = 5;
    let globalProductStock = 5;
    let successfulOrders = 0;
    let rejectedOrders = 0;

    const testStore = {
      id: 'store_mumbai_1',
      code: 'MUM-FLAGSHIP',
      name: 'AetherMart Mumbai Flagship',
      city: 'Mumbai',
      state: 'Maharashtra',
      address: 'Bandra West, Mumbai',
      latitude: 19.0607,
      longitude: 72.8362,
      isActive: true,
    };

    const testProduct = {
      id: 'prod_limited_1',
      title: 'Sony WH-1000XM5 Special Edition',
      sku: 'SONY-WH1000XM5-LIM',
      pricePaise: 2999000,
      stock: globalProductStock,
      isActive: true,
      images: ['https://example.com/sony.jpg'],
    };

    // Simulated Prisma with atomic conditional UPDATE support
    const prismaMock: any = {
      store: {
        findUnique: vi.fn().mockResolvedValue(testStore),
        findFirst: vi.fn().mockResolvedValue(testStore),
        findMany: vi.fn().mockResolvedValue([testStore]),
      },
      cart: {
        findUnique: vi.fn().mockImplementation(() =>
          Promise.resolve({
            id: 'cart_1',
            userId: 'user_1',
            items: [
              {
                id: 'cart_item_1',
                productId: testProduct.id,
                quantity: 1,
                product: testProduct,
              },
            ],
          }),
        ),
      },
      $transaction: vi.fn().mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        const tx = {
          inventory: {
            updateMany: vi.fn().mockImplementation(({ where, data }: any) => {
              // Simulates PostgreSQL: UPDATE inventory SET quantity = quantity - $n WHERE ... AND quantity >= $n
              if (where.productId === testProduct.id && storeInventoryStock >= data.quantity.decrement) {
                storeInventoryStock -= data.quantity.decrement;
                return Promise.resolve({ count: 1 });
              }
              return Promise.resolve({ count: 0 });
            }),
            findUnique: vi.fn().mockImplementation(() =>
              Promise.resolve({
                productId: testProduct.id,
                storeId: testStore.id,
                quantity: storeInventoryStock,
              }),
            ),
          },
          product: {
            updateMany: vi.fn().mockImplementation(({ where, data }: any) => {
              if (where.id === testProduct.id && globalProductStock >= data.stock.decrement) {
                globalProductStock -= data.stock.decrement;
                return Promise.resolve({ count: 1 });
              }
              return Promise.resolve({ count: 0 });
            }),
          },
          promoCode: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
          order: {
            create: vi.fn().mockImplementation(({ data }: any) =>
              Promise.resolve({
                id: `ord_${Math.random().toString(36).substring(2, 9)}`,
                orderNumber: data.orderNumber,
                userId: data.userId,
                status: data.status,
                totalPaise: data.totalPaise,
                storeId: data.storeId,
                city: data.city,
                items: data.items.create,
                payments: [{ status: 'INITIATED' }],
              }),
            ),
          },
          cartItem: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return callback(tx);
      }),
    };

    const outboxMock: Partial<OutboxService> = {
      enqueueMany: vi.fn().mockResolvedValue(undefined),
      triggerFlush: vi.fn(),
    };

    const paymentsMock: Partial<PaymentsService> = {
      buildUpiMetadata: vi.fn().mockReturnValue({
        provider: 'mock',
        upiUri: 'upi://pay?pa=aethermart@upi&am=29990.00',
      }),
      generateUpiPayload: vi.fn().mockResolvedValue({
        qrDataUrl: 'data:image/png;base64,fake-qr-data',
        upiUri: 'upi://pay?pa=aethermart@upi',
        amountPaise: 2999000,
        orderNumber: 'ORD-TEST',
        transactionRef: 'TXN-TEST',
        expiresAt: new Date().toISOString(),
      }),
    };

    const analyticsMock: Partial<AnalyticsService> = {
      track: vi.fn().mockResolvedValue(undefined),
    };

    const ordersService = new OrdersService(
      prismaMock,
      outboxMock as OutboxService,
      paymentsMock as PaymentsService,
      analyticsMock as AnalyticsService,
    );

    // Fire 100 concurrent purchase attempts
    const purchaseAttempts = Array.from({ length: 100 }, (_, i) =>
      ordersService
        .checkout(`user_${i + 1}`, {
          storeId: testStore.id,
          city: 'Mumbai',
          paymentMethod: 'UPI_QR',
          shippingAddress: {
            fullName: `Buyer ${i + 1}`,
            phone: '9876543210',
            line1: 'Bandra West',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400050',
            country: 'India',
          },
        })
        .then((res) => {
          successfulOrders += 1;
          return { success: true, orderId: res.order.id };
        })
        .catch((err) => {
          rejectedOrders += 1;
          expect(err).toBeInstanceOf(BadRequestException);
          expect(err.message).toContain('Insufficient stock');
          return { success: false, error: err.message };
        }),
    );

    const results = await Promise.all(purchaseAttempts);

    // Strict assertions
    expect(results).toHaveLength(100);
    expect(successfulOrders).toBe(5);
    expect(rejectedOrders).toBe(95);

    // Stock invariant assertion: Stock must be exactly 0, never negative!
    expect(storeInventoryStock).toBe(0);
    expect(globalProductStock).toBe(0);
    expect(storeInventoryStock).toBeGreaterThanOrEqual(0);
  });
});
