import { describe, expect, it, vi } from 'vitest';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { OutboxService } from '../kafka/outbox.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ConfigService } from '@nestjs/config';

describe('Omnichannel Fulfillment: BOPIS Click & Collect vs Express Home Delivery', () => {
  const testStore = {
    id: 'store_mumbai_flagship',
    code: 'MUM-FLAGSHIP',
    name: 'AetherMart Mumbai Bandra Flagship',
    city: 'Mumbai',
    state: 'Maharashtra',
    address: 'Linking Road, Bandra West, Mumbai',
    latitude: 19.0607,
    longitude: 72.8362,
    isActive: true,
  };

  const testProduct = {
    id: 'prod_bopis_1',
    title: 'Sony WH-1000XM5 Wireless Headphones',
    sku: 'SONY-WH1000XM5',
    pricePaise: 49900, // ₹499 (below ₹999 free shipping threshold)
    stock: 20,
    isActive: true,
    images: ['https://example.com/sony.jpg'],
  };

  const createPrismaMock = (initialStoreStock = 10) => {
    let currentStoreStock = initialStoreStock;
    let currentGlobalStock = initialStoreStock;

    return {
      store: {
        findUnique: vi.fn().mockResolvedValue(testStore),
        findFirst: vi.fn().mockResolvedValue(testStore),
        findMany: vi.fn().mockResolvedValue([testStore]),
      },
      cart: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cart_bopis_1',
          userId: 'user_priya_1',
          items: [
            {
              id: 'item_1',
              productId: testProduct.id,
              quantity: 1,
              product: testProduct,
            },
          ],
        }),
      },
      $transaction: vi.fn().mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        const tx = {
          inventory: {
            updateMany: vi.fn().mockImplementation(({ where, data }: any) => {
              if (currentStoreStock >= data.quantity.decrement) {
                currentStoreStock -= data.quantity.decrement;
                return Promise.resolve({ count: 1 });
              }
              return Promise.resolve({ count: 0 });
            }),
            findUnique: vi.fn().mockImplementation(() =>
              Promise.resolve({
                productId: testProduct.id,
                storeId: testStore.id,
                quantity: currentStoreStock,
              }),
            ),
          },
          product: {
            updateMany: vi.fn().mockImplementation(({ where, data }: any) => {
              if (currentGlobalStock >= data.stock.decrement) {
                currentGlobalStock -= data.stock.decrement;
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
                id: 'ord_bopis_123',
                orderNumber: data.orderNumber,
                userId: data.userId,
                status: data.status,
                subtotalPaise: data.subtotalPaise,
                shippingPaise: data.shippingPaise,
                totalPaise: data.totalPaise,
                storeId: data.storeId,
                city: data.city,
                shippingAddress: data.shippingAddress,
                items: data.items.create,
                payments: [{ status: 'INITIATED' }],
              }),
            ),
          },
          cartItem: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          paymentTransaction: {
            update: vi.fn().mockResolvedValue({ id: 'pay_1', status: 'SUCCESS' }),
          },
        };
        tx.order.update = vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: 'ord_bopis_123',
            orderNumber: 'AM-BOPIS-1234',
            userId: 'user_priya_1',
            status: data.status || 'CONFIRMED',
            paymentStatus: data.paymentStatus || 'PAID',
            totalPaise: 49900,
            shippingAddress: {
              fullName: 'Priya Nair',
              phone: '9876543210',
              fulfillmentType: 'STORE_PICKUP',
              pickupStoreId: testStore.id,
              pickupStoreName: testStore.name,
              line1: testStore.address,
              city: testStore.city,
            },
            payments: [{ id: 'pay_1', status: 'SUCCESS', utrNumber: 'UTR123456789012' }],
            items: [{ productId: testProduct.id, quantity: 1, pricePaise: 49900 }],
          }),
        );
        return callback(tx);
      }),
      order: {
        findUnique: vi.fn().mockImplementation(() =>
          Promise.resolve({
            id: 'ord_bopis_123',
            orderNumber: 'AM-BOPIS-1234',
            userId: 'user_priya_1',
            status: 'PENDING_PAYMENT',
            shippingAddress: {
              fullName: 'Priya Nair',
              phone: '9876543210',
              fulfillmentType: 'STORE_PICKUP',
              pickupStoreId: testStore.id,
              pickupStoreName: testStore.name,
              line1: testStore.address,
              city: testStore.city,
              state: 'Physical Store',
              postalCode: '000000',
            },
            payments: [{ id: 'pay_1', status: 'INITIATED', amountPaise: 49900 }],
            items: [{ productId: testProduct.id, quantity: 1, pricePaise: 49900 }],
          }),
        ),
        update: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: 'ord_bopis_123',
            status: data.status || 'CONFIRMED',
            paymentStatus: data.paymentStatus || 'PAID',
          }),
        ),
      },
      payment: {
        create: vi.fn().mockResolvedValue({ id: 'pay_1', status: 'INITIATED' }),
        update: vi.fn().mockResolvedValue({ id: 'pay_1', status: 'SUCCESS' }),
      },
    };
  };

  it('calculates 0 shipping for Click & Collect (STORE_PICKUP) and records pickup store details', async () => {
    const prismaMock = createPrismaMock(10);
    const outboxMock: Partial<OutboxService> = {
      enqueueMany: vi.fn().mockResolvedValue(undefined),
      triggerFlush: vi.fn(),
    };
    const paymentsMock: any = {
      buildUpiMetadata: vi.fn().mockReturnValue({
        upiUri: 'upi://pay?mock',
        transactionRef: 'tx_123',
      }),
      generateUpiPayload: vi.fn().mockResolvedValue({
        id: 'pay_1',
        qrDataUrl: 'data:image/png;base64,mock',
        upiUri: 'upi://pay?mock',
        transactionRef: 'tx_123',
        amountPaise: 49900,
      }),
    };
    const analyticsMock: Partial<AnalyticsService> = {
      track: vi.fn(),
    };

    const ordersService = new OrdersService(
      prismaMock as any,
      outboxMock as any,
      paymentsMock as any,
      analyticsMock as any,
    );

    const result = await ordersService.checkout('user_priya_1', {
      fulfillmentType: 'STORE_PICKUP',
      storeId: testStore.id,
      city: 'Mumbai',
      shippingAddress: {
        fullName: 'Priya Nair',
        phone: '9876543210',
        line1: testStore.address,
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400050',
        country: 'India',
        fulfillmentType: 'STORE_PICKUP',
        pickupStoreId: testStore.id,
        pickupStoreName: testStore.name,
      },
      paymentMethod: 'UPI_QR',
    });

    // 1. Assert shipping fee is completely waived for store pickup
    expect(result.order.shippingPaise).toBe(0);
    expect(result.order.totalPaise).toBe(testProduct.pricePaise);

    // 2. Assert Store ID and City are saved
    expect(result.order.storeId).toBe(testStore.id);
    expect(result.order.city).toBe('Mumbai');

    // 3. Assert shippingAddress records omnichannel metadata
    expect(result.order.shippingAddress.fulfillmentType).toBe('STORE_PICKUP');
    expect(result.order.shippingAddress.pickupStoreId).toBe(testStore.id);
    expect(result.order.shippingAddress.pickupStoreName).toBe(testStore.name);

    // 4. Assert outbox event was enqueued with fulfillmentType
    expect(outboxMock.enqueueMany).toHaveBeenCalled();
    const enqueuedPayload = (outboxMock.enqueueMany as any).mock.calls[0][1][0].payload;
    expect(enqueuedPayload.type).toBe('order.created');
    expect(enqueuedPayload.fulfillmentType).toBe('STORE_PICKUP');
  });

  it('charges ₹79 standard shipping for Express Delivery when subtotal is below ₹999', async () => {
    const prismaMock = createPrismaMock(10);
    const outboxMock: Partial<OutboxService> = {
      enqueueMany: vi.fn().mockResolvedValue(undefined),
      triggerFlush: vi.fn(),
    };
    const paymentsMock: any = {
      buildUpiMetadata: vi.fn().mockReturnValue({
        upiUri: 'upi://pay?mock',
        transactionRef: 'tx_124',
      }),
      generateUpiPayload: vi.fn().mockResolvedValue({
        id: 'pay_2',
        qrDataUrl: 'data:image/png;base64,mock',
        upiUri: 'upi://pay?mock',
        transactionRef: 'tx_124',
        amountPaise: 49900 + 7900,
      }),
    };
    const analyticsMock: Partial<AnalyticsService> = {
      track: vi.fn(),
    };

    const ordersService = new OrdersService(
      prismaMock as any,
      outboxMock as any,
      paymentsMock as any,
      analyticsMock as any,
    );

    const result = await ordersService.checkout('user_priya_1', {
      fulfillmentType: 'HOME_DELIVERY',
      city: 'Mumbai',
      shippingAddress: {
        fullName: 'Priya Nair',
        phone: '9876543210',
        line1: 'Bandra West, Apartment 4B',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400050',
        country: 'India',
        fulfillmentType: 'HOME_DELIVERY',
      },
      paymentMethod: 'UPI_QR',
    });

    // 1. Assert standard delivery fee (₹79 = 7900 paise) is charged
    expect(result.order.shippingPaise).toBe(7900);
    expect(result.order.totalPaise).toBe(testProduct.pricePaise + 7900);
    expect(result.order.shippingAddress.fulfillmentType).toBe('HOME_DELIVERY');
  });

  it('enqueues order.pickup_ready event to Kafka upon payment verification for Click & Collect', async () => {
    const prismaMock = createPrismaMock(10);
    const outboxMock: any = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      enqueueMany: vi.fn().mockResolvedValue(undefined),
      triggerFlush: vi.fn(),
    };
    const configMock: Partial<ConfigService> = {
      get: vi.fn().mockReturnValue('test-value'),
    };

    const paymentsService = new PaymentsService(
      configMock as any,
      prismaMock as any,
      outboxMock as any,
    );

    const result = await paymentsService.verifyUpiPayment('user_priya_1', 'ord_bopis_123', 'UTR123456789012');
    expect(result.order.id).toBe('ord_bopis_123');
    expect(result.order.paymentStatus).toBe('PAID');
    expect(result.utrNumber).toBe('UTR123456789012');

    // Verify outbox was called with order.pickup_ready
    expect(outboxMock.enqueue).toHaveBeenCalled();
    const calls = outboxMock.enqueue.mock.calls;
    const hasPickupReady = calls.some((call: any) => call[1]?.eventType === 'order.pickup_ready');
    expect(hasPickupReady).toBe(true);
  });
});
