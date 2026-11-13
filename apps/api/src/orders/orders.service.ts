import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KAFKA_TOPICS } from '@ecommerce/shared';
import { OrderStatus, PaymentStatus, PaymentTxStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AnalyticsService } from '../analytics/analytics.service';
import { OutboxService } from '../kafka/outbox.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { Optional } from '@nestjs/common';
import { CheckoutDto, RetryUpiDto } from './dto/order.dto';
import { SystemActivityService } from '../system/system-activity.service';

const FREE_SHIPPING_THRESHOLD_PAISE = 99900;
const STANDARD_SHIPPING_PAISE = 7900;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
    @Optional() @Inject(SystemActivityService) private readonly activity?: SystemActivityService,
  ) {}

  async checkout(userId: string, dto: CheckoutDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { product: true },
        },
      },
    });

    const activeCartItems = (cart?.items ?? []).filter((item) => item.product.isActive);
    if (activeCartItems.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    const storeTargetCity = dto.city?.trim() || dto.shippingAddress?.city?.trim();
    let selectedStore: { id: string; name: string; city: string } | null = null;

    if (dto.storeId?.trim() && this.prisma.store) {
      selectedStore = await this.prisma.store.findUnique({
        where: { id: dto.storeId.trim() },
        select: { id: true, name: true, city: true },
      });
    }

    if (!selectedStore && storeTargetCity && this.prisma.store) {
      selectedStore = await this.prisma.store.findFirst({
        where: {
          city: { equals: storeTargetCity, mode: 'insensitive' },
          isActive: true,
        },
        select: { id: true, name: true, city: true },
      });
    }

    if (!selectedStore && this.prisma.store) {
      selectedStore = await this.prisma.store.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, city: true },
      });
    }

    const isStorePickup = dto.fulfillmentType === 'STORE_PICKUP';
    const subtotalPaise = activeCartItems.reduce(
      (sum, item) => sum + item.product.pricePaise * item.quantity,
      0,
    );

    const orderNumber = this.generateOrderNumber();
    const transactionRef = `TXN${Date.now().toString().slice(-8)}${randomUUID().slice(0, 4).toUpperCase()}`;

    const createdResult = await this.prisma.$transaction(async (tx) => {
      for (const item of activeCartItems) {
        // Atomic conditional UPDATE on store inventory
        if (selectedStore && (tx as any).inventory) {
          const updatedInv = await (tx as any).inventory.updateMany({
            where: {
              productId: item.productId,
              storeId: selectedStore.id,
              quantity: { gte: item.quantity },
            },
            data: {
              quantity: { decrement: item.quantity },
            },
          });
          if (updatedInv.count !== 1) {
            const currentInv = await (tx as any).inventory.findUnique({
              where: { productId_storeId: { productId: item.productId, storeId: selectedStore.id } },
            });
            throw new BadRequestException(
              `Insufficient stock for "${item.product.title}" at ${selectedStore.name} (${selectedStore.city}). Available: ${currentInv?.quantity ?? 0}`,
            );
          }
        }

        // Atomic conditional UPDATE on global product stock
        const updated = await tx.product.updateMany({
          where: {
            id: item.productId,
            isActive: true,
            stock: { gte: item.quantity },
          },
          data: {
            stock: { decrement: item.quantity },
          },
        });
        if (updated.count !== 1) {
          throw new BadRequestException(
            `Insufficient stock for "${item.product.title}". Available: ${item.product.stock}`,
          );
        }
      }

      let discountPaise = 0;
      let appliedPromoCode: string | null = null;
      if (dto.promoCode?.trim()) {
        const code = dto.promoCode.trim().toUpperCase();
        const promo = await tx.promoCode.findUnique({ where: { code } });
        if (!promo || !promo.isActive) {
          throw new BadRequestException('Promo code is invalid or inactive');
        }
        if (promo.expiresAt && promo.expiresAt < new Date()) {
          throw new BadRequestException('Promo code has expired');
        }
        if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
          throw new BadRequestException('Promo code usage limit reached');
        }
        if (subtotalPaise < promo.minOrderPaise) {
          throw new BadRequestException(
            `Minimum order of ₹${(promo.minOrderPaise / 100).toFixed(0)} required for promo ${code}`,
          );
        }

        discountPaise =
          promo.discountType === 'PERCENTAGE'
            ? Math.floor((subtotalPaise * promo.discountValue) / 100)
            : promo.discountValue;
        if (promo.maxDiscountPaise !== null && discountPaise > promo.maxDiscountPaise) {
          discountPaise = promo.maxDiscountPaise;
        }
        if (discountPaise > subtotalPaise) {
          discountPaise = subtotalPaise;
        }

        await tx.promoCode.update({
          where: { id: promo.id },
          data: { usedCount: { increment: 1 } },
        });
        appliedPromoCode = promo.code;
      }

      const afterDiscount = Math.max(0, subtotalPaise - discountPaise);
      const shippingPaise = isStorePickup
        ? 0
        : afterDiscount >= FREE_SHIPPING_THRESHOLD_PAISE
        ? 0
        : STANDARD_SHIPPING_PAISE;
      const totalPaise = afterDiscount + shippingPaise;

      const upiMeta = this.payments.buildUpiMetadata({
        orderNumber,
        transactionRef,
        amountPaise: totalPaise,
        method: dto.paymentMethod,
        upiVpa: dto.upiVpa,
      });

      const enrichedShippingAddress = {
        ...dto.shippingAddress,
        fulfillmentType: isStorePickup ? 'STORE_PICKUP' : 'HOME_DELIVERY',
        pickupStoreId: selectedStore?.id ?? null,
        pickupStoreName: selectedStore?.name ?? null,
      };

      const order = await tx.order.create({
        data: {
          orderNumber,
          userId,
          storeId: selectedStore?.id ?? null,
          city: selectedStore?.city ?? null,
          status: OrderStatus.PENDING_PAYMENT,
          paymentMethod: dto.paymentMethod,
          paymentStatus: PaymentStatus.PENDING,
          subtotalPaise,
          discountPaise,
          shippingPaise,
          totalPaise,
          promoCode: appliedPromoCode,
          shippingAddress: enrichedShippingAddress as unknown as Prisma.InputJsonValue,
          upiTransactionRef: transactionRef,
          upiVpa: dto.upiVpa?.trim() || null,
          items: {
            create: activeCartItems.map((item) => ({
              productId: item.productId,
              titleSnapshot: item.product.title,
              skuSnapshot: item.product.sku,
              imageSnapshot: item.product.images[0] ?? null,
              pricePaise: item.product.pricePaise,
              quantity: item.quantity,
            })),
          },
          payments: {
            create: {
              provider: upiMeta.provider,
              method: dto.paymentMethod,
              amountPaise: totalPaise,
              currency: 'INR',
              upiVpa: dto.upiVpa?.trim() || null,
              upiUri: upiMeta.upiUri,
              status: PaymentTxStatus.INITIATED,
            },
          },
        },
        include: {
          items: true,
          payments: true,
          store: true,
        },
      });

      if (cart) {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      }

      const nowIso = new Date().toISOString();
      await this.outbox.enqueueMany(tx, [
        {
          aggregateType: 'Order',
          aggregateId: order.id,
          topic: KAFKA_TOPICS.ORDER_EVENTS,
          eventType: 'order.created',
          payload: {
            eventId: randomUUID(),
            type: 'order.created',
            orderId: order.id,
            orderNumber: order.orderNumber,
            userId: order.userId,
            status: order.status,
            totalPaise: order.totalPaise,
            storeId: selectedStore?.id ?? null,
            city: selectedStore?.city ?? null,
            fulfillmentType: isStorePickup ? 'STORE_PICKUP' : 'HOME_DELIVERY',
            occurredAt: nowIso,
          },
        },
        ...activeCartItems.map((item) => ({
          aggregateType: 'Product',
          aggregateId: item.productId,
          topic: KAFKA_TOPICS.CATALOG_EVENTS,
          eventType: 'product.stock_changed',
          payload: {
            eventId: randomUUID(),
            type: 'product.stock_changed',
            productId: item.productId,
            storeId: selectedStore?.id ?? null,
            city: selectedStore?.city ?? null,
            quantity: item.quantity,
            occurredAt: nowIso,
          },
        })),
      ]);

      return order;
    });

    const upiPayload = await this.payments.generateUpiPayload({
      orderNumber: createdResult.orderNumber,
      transactionRef,
      amountPaise: createdResult.totalPaise,
      method: dto.paymentMethod,
      upiVpa: dto.upiVpa,
    });

    this.outbox.triggerFlush();
    this.activity?.record({
      service: 'PostgreSQL',
      step: 'order_saved_postgres',
      title: `Order ${createdResult.orderNumber} committed to PostgreSQL`,
      details: {
        orderId: createdResult.id,
        orderNumber: createdResult.orderNumber,
        totalPaise: createdResult.totalPaise,
        storeId: createdResult.storeId,
        city: createdResult.city,
      },
    });
    void this.analytics.track({
      type: 'checkout.started',
      userId,
      orderId: createdResult.id,
      metadata: {
        totalPaise: createdResult.totalPaise,
        paymentMethod: dto.paymentMethod,
      },
    });

    return {
      order: createdResult,
      payment: upiPayload,
    };
  }

  async retryUpiPayment(userId: string, orderId: string, dto: RetryUpiDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Order is already paid');
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled orders cannot be retried');
    }

    const transactionRef = `TXN${Date.now().toString().slice(-8)}${randomUUID().slice(0, 4).toUpperCase()}`;
    const upiPayload = await this.payments.generateUpiPayload({
      orderNumber: order.orderNumber,
      transactionRef,
      amountPaise: order.totalPaise,
      method: dto.paymentMethod,
      upiVpa: dto.upiVpa,
    });

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      if (order.status === OrderStatus.FAILED) {
        for (const item of order.items) {
          const res = await tx.product.updateMany({
            where: { id: item.productId, isActive: true, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (res.count !== 1) {
            throw new BadRequestException(
              `Insufficient stock to retry "${item.titleSnapshot}"`,
            );
          }
          await this.outbox.enqueue(tx, {
            aggregateType: 'Product',
            aggregateId: item.productId,
            topic: KAFKA_TOPICS.CATALOG_EVENTS,
            eventType: 'product.stock_changed',
            payload: {
              eventId: randomUUID(),
              type: 'product.stock_changed',
              productId: item.productId,
              occurredAt: new Date().toISOString(),
            },
          });
        }
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PENDING_PAYMENT,
          paymentMethod: dto.paymentMethod,
          paymentStatus: PaymentStatus.PENDING,
          upiTransactionRef: transactionRef,
          upiVpa: dto.upiVpa?.trim() || null,
          payments: {
            create: {
              provider: upiPayload.provider,
              method: dto.paymentMethod,
              amountPaise: order.totalPaise,
              currency: 'INR',
              upiVpa: dto.upiVpa?.trim() || null,
              upiUri: upiPayload.upiUri,
              status: PaymentTxStatus.INITIATED,
            },
          },
        },
        include: {
          items: true,
          payments: { orderBy: { createdAt: 'desc' } },
        },
      });
    });

    this.outbox.triggerFlush();
    return { order: updatedOrder, payment: upiPayload };
  }

  async listMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        items: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrderById(userId: string, orderId: string, isAdmin = false) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payments: { orderBy: { createdAt: 'desc' } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!isAdmin && order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    let upiPayload: Awaited<ReturnType<PaymentsService['generateUpiPayload']>> | null = null;
    if (order.paymentStatus === PaymentStatus.PENDING && order.status === OrderStatus.PENDING_PAYMENT) {
      upiPayload = await this.payments
        .generateUpiPayload({
          orderNumber: order.orderNumber,
          transactionRef: order.upiTransactionRef || order.orderNumber,
          amountPaise: order.totalPaise,
          method: order.paymentMethod,
          upiVpa: order.upiVpa ?? undefined,
        })
        .catch(() => null);
    }

    return { order, payment: upiPayload };
  }

  async cancelOrder(userId: string, orderId: string, isAdmin = false) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!isAdmin && order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }
    if (order.status === OrderStatus.SHIPPED || order.status === OrderStatus.DELIVERED) {
      throw new BadRequestException('Orders that are already shipped or delivered cannot be cancelled');
    }
    if (order.status === OrderStatus.CANCELLED) {
      return order;
    }

    const shouldRestoreStock = order.status !== OrderStatus.FAILED;

    const cancelled = await this.prisma.$transaction(async (tx) => {
      if (shouldRestoreStock) {
        for (const item of order.items) {
          if (order.storeId) {
            await tx.inventory.updateMany({
              where: { productId: item.productId, storeId: order.storeId },
              data: { quantity: { increment: item.quantity } },
            });
          }
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
          await this.outbox.enqueue(tx, {
            aggregateType: 'Product',
            aggregateId: item.productId,
            topic: KAFKA_TOPICS.CATALOG_EVENTS,
            eventType: 'product.stock_changed',
            payload: {
              eventId: randomUUID(),
              type: 'product.stock_changed',
              productId: item.productId,
              occurredAt: new Date().toISOString(),
            },
          });
        }
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          ...(order.paymentStatus === PaymentStatus.PAID
            ? { paymentStatus: PaymentStatus.REFUNDED }
            : {}),
        },
        include: { items: true, payments: true },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'Order',
        aggregateId: updated.id,
        topic: KAFKA_TOPICS.ORDER_EVENTS,
        eventType: 'order.cancelled',
        payload: {
          eventId: randomUUID(),
          type: 'order.cancelled',
          orderId: updated.id,
          orderNumber: updated.orderNumber,
          userId: updated.userId,
          status: updated.status,
          previousStatus: order.status,
          totalPaise: updated.totalPaise,
          occurredAt: new Date().toISOString(),
        },
      });

      return updated;
    });

    this.outbox.triggerFlush();
    return cancelled;
  }

  async listAllOrdersAdmin() {
    return this.prisma.order.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateOrderStatusAdmin(orderId: string, status: OrderStatus) {
    if (status === OrderStatus.CANCELLED) {
      return this.cancelOrder('', orderId, true);
    }

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: orderId },
        data: { status },
        include: {
          user: { select: { id: true, name: true, email: true } },
          items: true,
        },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'Order',
        aggregateId: row.id,
        topic: KAFKA_TOPICS.ORDER_EVENTS,
        eventType: 'order.status_updated',
        payload: {
          eventId: randomUUID(),
          type: 'order.status_updated',
          orderId: row.id,
          orderNumber: row.orderNumber,
          userId: row.userId,
          status: row.status,
          previousStatus: order.status,
          totalPaise: row.totalPaise,
          occurredAt: new Date().toISOString(),
        },
      });

      return row;
    });

    this.outbox.triggerFlush();
    return updated;
  }

  private generateOrderNumber(): string {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `ORD-${datePart}-${rand}`;
  }

  async listStores() {
    return this.prisma.store.findMany({
      where: { isActive: true },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });
  }

  async getProductStoreInventory(productId: string) {
    return this.prisma.inventory.findMany({
      where: { productId },
      include: { store: true },
      orderBy: { store: { city: 'asc' } },
    });
  }
}

