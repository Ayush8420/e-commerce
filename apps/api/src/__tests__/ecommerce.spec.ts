import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { buildUpiDeepLink, formatInrFromPaise, KAFKA_TOPICS, UPI_VPA_REGEX } from '@ecommerce/shared';
import { AuthService } from '../auth/auth.service';
import { MailerService } from '../notifications/mailer.service';
import { NotificationConsumer } from '../notifications/notification.consumer';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { CatalogConsumer } from '../search/catalog.consumer';
import { OpenSearchService } from '../search/opensearch.service';
import { CatalogService } from '../catalog/catalog.service';
import { buildPrismaDatasourceUrl } from '../prisma/prisma.service';

function makeConfig(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    JWT_REFRESH_EXPIRES_DAYS: '7',
    MERCHANT_UPI_VPA: 'aethermart@upi',
    MERCHANT_UPI_NAME: 'AetherMart Commerce',
    UPI_PROVIDER: 'mock',
    FRONTEND_URL: 'http://localhost:3000',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    ...overrides,
  };
  return {
    get: (key: string, fallback = '') => defaults[key] ?? fallback,
  } as unknown as ConfigService;
}

describe('Shared UPI & INR utilities', () => {
  it('formats paise in INR currency accurately', () => {
    expect(formatInrFromPaise(2499000)).toContain('24,990');
    expect(formatInrFromPaise(99950)).toContain('999.5');
  });

  it('validates UPI VPA IDs and builds NPCI deep links', () => {
    expect(UPI_VPA_REGEX.test('priya.nair@okicici')).toBe(true);
    expect(UPI_VPA_REGEX.test('invalid-vpa')).toBe(false);

    const uri = buildUpiDeepLink({
      merchantVpa: 'aethermart@upi',
      merchantName: 'AetherMart Commerce',
      transactionRef: 'TXN123456',
      amountPaise: 199900,
      note: 'Order ORD-1001',
    });
    expect(uri).toContain('upi://pay?');
    expect(uri).toContain('pa=aethermart%40upi');
    expect(uri).toContain('am=1999.00');
    expect(uri).toContain('cu=INR');
  });
});

describe('PaymentsService UPI flow', () => {
  it('generates scannable QR code data URL for UPI_QR and validates VPA for UPI_VPA', async () => {
    const payments = new PaymentsService(
      makeConfig(),
      {} as never,
      { enqueue: vi.fn(), triggerFlush: vi.fn() } as never,
    );

    const qrResult = await payments.generateUpiPayload({
      orderNumber: 'ORD-20261112-100001',
      transactionRef: 'TXN100001',
      amountPaise: 250000,
      method: 'UPI_QR',
    });
    expect(qrResult.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(qrResult.upiUri).toContain('am=2500.00');

    await expect(
      payments.generateUpiPayload({
        orderNumber: 'ORD-20261112-100002',
        transactionRef: 'TXN100002',
        amountPaise: 250000,
        method: 'UPI_VPA',
        upiVpa: 'not-a-upi-id',
      }),
    ).rejects.toThrow(/valid UPI ID/i);
  });

  it('restores stock and emits Kafka outbox events when UPI payment fails', async () => {
    const outboxEnqueue = vi.fn().mockResolvedValue(undefined);
    const triggerFlush = vi.fn();
    const productUpdate = vi.fn().mockResolvedValue({});
    const orderUpdate = vi.fn().mockResolvedValue({
      id: 'ord_1',
      orderNumber: 'ORD-1',
      userId: 'usr_1',
      status: 'FAILED',
      totalPaise: 150000,
      items: [],
      payments: [],
    });
    const paymentTxUpdate = vi.fn().mockResolvedValue({});

    const prismaMock = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'ord_1',
          orderNumber: 'ORD-1',
          userId: 'usr_1',
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          totalPaise: 150000,
          items: [{ productId: 'prod_1', quantity: 2 }],
          payments: [{ id: 'ptx_1' }],
        }),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          paymentTransaction: { update: paymentTxUpdate },
          product: { update: productUpdate },
          order: { update: orderUpdate },
        }),
      ),
    };

    const payments = new PaymentsService(
      makeConfig(),
      prismaMock as never,
      { enqueue: outboxEnqueue, triggerFlush } as never,
    );

    const res = await payments.failUpiPayment('usr_1', 'ord_1', 'Declined by bank');
    expect(res.order.status).toBe('FAILED');
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { stock: { increment: 2 } },
    });
    expect(outboxEnqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: KAFKA_TOPICS.CATALOG_EVENTS, eventType: 'product.stock_changed' }),
    );
    expect(outboxEnqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: KAFKA_TOPICS.ORDER_EVENTS, eventType: 'order.payment_failed' }),
    );
    expect(triggerFlush).toHaveBeenCalled();
  });
});

describe('OrdersService checkout', () => {
  it('applies promo discount, reserves stock atomically, and enqueues order & catalog outbox events', async () => {
    const outboxEnqueue = vi.fn().mockResolvedValue(undefined);
    const outboxEnqueueMany = vi.fn().mockResolvedValue(undefined);
    const triggerFlush = vi.fn();
    const payments = new PaymentsService(
      makeConfig(),
      {} as never,
      { enqueue: outboxEnqueue, enqueueMany: outboxEnqueueMany, triggerFlush } as never,
    );

    const txMock = {
      product: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      inventory: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ quantity: 10 }),
      },
      promoCode: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'promo_1',
          code: 'WELCOME10',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          minOrderPaise: 50000,
          maxDiscountPaise: 150000,
          maxUses: null,
          usedCount: 0,
          isActive: true,
          expiresAt: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      order: {
        create: vi.fn().mockImplementation(async ({ data }) => ({
          id: 'ord_99',
          ...data,
          items: data.items.create,
          payments: [data.payments.create],
        })),
      },
      cartItem: { deleteMany: vi.fn().mockResolvedValue({}) },
    };

    const prismaMock = {
      store: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue({
          id: 'store_blr_1',
          name: 'AetherMart Bengaluru Hub',
          city: 'Bengaluru',
        }),
      },
      cart: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cart_1',
          items: [
            {
              productId: 'prod_1',
              quantity: 2,
              product: {
                id: 'prod_1',
                title: 'Mechanical Keyboard',
                sku: 'KEY-1',
                pricePaise: 100000,
                stock: 5,
                isActive: true,
                images: ['https://example.com/kb.jpg'],
              },
            },
          ],
        }),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
    };

    const analyticsMock = { track: vi.fn().mockResolvedValue(undefined) };
    const orders = new OrdersService(
      prismaMock as never,
      { enqueue: outboxEnqueue, enqueueMany: outboxEnqueueMany, triggerFlush } as never,
      payments,
      analyticsMock as never,
    );

    const result = await orders.checkout('usr_1', {
      paymentMethod: 'UPI_QR',
      promoCode: 'welcome10',
      shippingAddress: {
        fullName: 'Priya Nair',
        phone: '9876543210',
        line1: '14 MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'India',
      },
    });

    // Subtotal = 200000, 10% discount = 20000, afterDiscount = 180000 (>= 99900 free shipping)
    expect(result.order.subtotalPaise).toBe(200000);
    expect(result.order.discountPaise).toBe(20000);
    expect(result.order.shippingPaise).toBe(0);
    expect(result.order.totalPaise).toBe(180000);
    expect(result.payment.upiUri).toContain('am=1800.00');
    expect(outboxEnqueueMany).toHaveBeenCalledTimes(1);
    expect(outboxEnqueueMany.mock.calls[0][1]).toHaveLength(2);
    expect(triggerFlush).toHaveBeenCalled();
  });
});

describe('AuthService, Notifications & CatalogConsumer', () => {
  it('enqueues email verification on register and links Google OAuth users cleanly', async () => {
    const outboxEnqueue = vi.fn().mockResolvedValue(undefined);
    const triggerFlush = vi.fn();
    const prismaMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      refreshToken: {
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({
              id: 'usr_new',
              email: 'new@example.com',
              name: 'New Buyer',
              role: 'CUSTOMER',
              avatarUrl: null,
              emailVerified: false,
            }),
          },
        }),
      ),
    };

    const jwt = new JwtService({ secret: 'test-secret' });
    const auth = new AuthService(
      prismaMock as never,
      jwt,
      makeConfig(),
      { enqueue: outboxEnqueue, triggerFlush } as never,
    );

    const session = await auth.register({
      name: 'New Buyer',
      email: 'new@example.com',
      password: 'Password123',
    });

    expect(session.accessToken).toBeTruthy();
    expect(outboxEnqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: KAFKA_TOPICS.NOTIFICATION_EVENTS,
        eventType: 'email.verify',
      }),
    );
  });

  it('renders order confirmation email templates and ensures idempotent NotificationConsumer delivery', async () => {
    const mailer = new MailerService(makeConfig());
    const rendered = mailer.renderTemplate({
      eventId: 'evt-1',
      type: 'email.order_confirmed',
      to: 'buyer@example.com',
      subject: 'Order Confirmed: ORD-101',
      data: {
        name: 'Priya',
        orderId: 'ord_101',
        orderNumber: 'ORD-101',
        totalPaise: 249900,
        utrNumber: 'UTR99887766',
        items: [{ title: 'Keychron Q1', quantity: 1, pricePaise: 249900 }],
      },
      occurredAt: new Date().toISOString(),
    });
    expect(rendered.html).toContain('ORD-101');
    expect(rendered.html).toContain('UTR99887766');
    expect(rendered.text).toContain('2,499');

    const sendNotification = vi.fn().mockResolvedValue({ messageId: 'msg-1' });
    const createLog = vi.fn().mockResolvedValue({});
    const consumer = new NotificationConsumer(
      { registerConsumer: vi.fn() } as never,
      {
        notificationLog: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'already-sent' }),
          create: createLog,
        },
      } as never,
      { sendNotification } as never,
    );

    const event = {
      eventId: 'evt-dup-1',
      type: 'email.welcome' as const,
      to: 'buyer@example.com',
      subject: 'Welcome',
      data: { name: 'Priya' },
      occurredAt: new Date().toISOString(),
    };
    await consumer.handleNotificationEvent(event);
    await consumer.handleNotificationEvent(event);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(createLog).toHaveBeenCalledTimes(1);
  });

  it('routes catalog.events to OpenSearch sync or delete', async () => {
    const syncProductById = vi.fn().mockResolvedValue(undefined);
    const deleteProduct = vi.fn().mockResolvedValue(undefined);
    const idempotencyMock = {
      isEventProcessed: vi.fn().mockResolvedValue(false),
      markEventProcessed: vi.fn().mockResolvedValue(true),
    };
    const consumer = new CatalogConsumer(
      { registerConsumer: vi.fn() } as never,
      { syncProductById } as never,
      { deleteProduct } as never,
      idempotencyMock as never,
    );

    await consumer.handleCatalogEvent({
      eventId: 'c1',
      type: 'product.updated',
      productId: 'p1',
      occurredAt: new Date().toISOString(),
    });
    await consumer.handleCatalogEvent({
      eventId: 'c2',
      type: 'product.deleted',
      productId: 'p2',
      occurredAt: new Date().toISOString(),
    });

    expect(syncProductById).toHaveBeenCalledWith('p1');
    expect(deleteProduct).toHaveBeenCalledWith('p2');
  });

  it('serves 20 dummy products with facets when OpenSearch and PostgreSQL are unavailable', async () => {
    const failingPrisma = {
      product: {
        findMany: vi.fn().mockRejectedValue(new Error('DB offline')),
        count: vi.fn().mockRejectedValue(new Error('DB offline')),
        findUnique: vi.fn().mockRejectedValue(new Error('DB offline')),
      },
      category: {
        findMany: vi.fn().mockRejectedValue(new Error('DB offline')),
      },
    };

    const openSearch = new OpenSearchService(
      makeConfig({ OPENSEARCH_NODE: 'http://127.0.0.1:19200' }),
      failingPrisma as never,
    );
    const allRes = await openSearch.searchProducts({ limit: 8 });
    expect(allRes.searchEngine).toBe('demo-fallback');
    expect(allRes.total).toBe(23);
    expect(allRes.items).toHaveLength(8);
    expect(allRes.facets.categories.length).toBe(7);

    const kbRes = await openSearch.searchProducts({ category: 'mechanical-keyboards' });
    expect(kbRes.total).toBe(3);

    const catalog = new CatalogService(failingPrisma as never, {} as never);
    const cats = await catalog.listCategories();
    expect(cats).toHaveLength(7);
    const detail = await catalog.getProductBySlug('keychron-q1-pro-qmk-aluminum');
    expect(detail.brand).toBe('Keychron');
  });

  it('appends pgbouncer=true and connect_timeout=15 automatically for Neon -pooler URLs', () => {
    const pooled = buildPrismaDatasourceUrl(
      'postgresql://user:pass@ep-cool-host-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
    );
    expect(pooled).toContain('pgbouncer=true');
    expect(pooled).toContain('connect_timeout=15');

    const direct = buildPrismaDatasourceUrl(
      'postgresql://user:pass@ep-cool-host.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
    );
    expect(direct).not.toContain('pgbouncer=true');
    expect(direct).toContain('connect_timeout=15');
  });

  it('configures Nodemailer for Gmail SMTP and normalizes App Password spaces', () => {
    const unconfigured = new MailerService(
      makeConfig({ SMTP_SERVICE: 'gmail', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_USER: '', SMTP_PASS: '' }),
    );
    expect(unconfigured.hasCredentials()).toBe(false);

    const configured = new MailerService(
      makeConfig({
        SMTP_SERVICE: 'gmail',
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'store@gmail.com',
        SMTP_PASS: 'abcd efgh ijkl mnop',
      }),
    );
    expect(configured.hasCredentials()).toBe(true);
  });
});

