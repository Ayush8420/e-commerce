import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildUpiDeepLink,
  KAFKA_TOPICS,
  PaymentMethod,
  UPI_VPA_REGEX,
} from '@ecommerce/shared';
import { OrderStatus, PaymentStatus, PaymentTxStatus, Prisma } from '@prisma/client';
import { createHmac, randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { OutboxService } from '../kafka/outbox.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  private readonly merchantVpa: string;
  private readonly merchantName: string;
  private readonly provider: string;
  private readonly razorpayWebhookSecret: string;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {
    this.merchantVpa = this.config.get<string>('MERCHANT_UPI_VPA', 'aethermart@upi');
    this.merchantName = this.config.get<string>('MERCHANT_UPI_NAME', 'AetherMart Commerce');
    this.provider = this.config.get<string>('UPI_PROVIDER', 'mock');
    this.razorpayWebhookSecret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET', '');
  }

  buildUpiMetadata(params: {
    orderNumber: string;
    transactionRef: string;
    amountPaise: number;
    method: PaymentMethod;
    upiVpa?: string;
  }) {
    if (params.method === 'UPI_VPA') {
      if (!params.upiVpa || !UPI_VPA_REGEX.test(params.upiVpa.trim())) {
        throw new BadRequestException('Please enter a valid UPI ID (e.g. name@okicici)');
      }
    }

    const upiUri = buildUpiDeepLink({
      merchantVpa: this.merchantVpa,
      merchantName: this.merchantName,
      transactionRef: params.transactionRef,
      amountPaise: params.amountPaise,
      note: `Order ${params.orderNumber}`,
    });

    return {
      provider: this.provider === 'razorpay' ? 'RAZORPAY_UPI' : 'UPI_SIMULATED',
      merchantVpa: this.merchantVpa,
      merchantName: this.merchantName,
      transactionRef: params.transactionRef,
      amountPaise: params.amountPaise,
      upiUri,
      customerVpa: params.upiVpa?.trim() || null,
    };
  }

  async generateUpiPayload(params: {
    orderNumber: string;
    transactionRef: string;
    amountPaise: number;
    method: PaymentMethod;
    upiVpa?: string;
  }) {
    const meta = this.buildUpiMetadata(params);
    const qrDataUrl = await QRCode.toDataURL(meta.upiUri, {
      width: 280,
      margin: 2,
      color: {
        dark: '#111827',
        light: '#FFFFFF',
      },
    });

    return {
      ...meta,
      qrDataUrl,
    };
  }

  async verifyUpiPayment(
    userId: string,
    orderId: string,
    utrNumberInput?: string,
    isAdmin = false,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!isAdmin && order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      return { order, alreadyPaid: true };
    }
    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.FAILED) {
      throw new BadRequestException(
        `Cannot complete payment for order in ${order.status} status. Retry payment first.`,
      );
    }

    const utrNumber =
      utrNumberInput?.trim() ||
      `UTR${Date.now().toString().slice(-8)}${Math.floor(1000 + Math.random() * 9000)}`;

    if (utrNumber.length < 6) {
      throw new BadRequestException('Please provide a valid UTR / UPI reference number');
    }

    const latestPayment = order.payments[0];

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      if (latestPayment) {
        await tx.paymentTransaction.update({
          where: { id: latestPayment.id },
          data: {
            status: PaymentTxStatus.SUCCESS,
            utrNumber,
          },
        });
      }

      const confirmed = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
        },
        include: {
          items: true,
          payments: { orderBy: { createdAt: 'desc' } },
        },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'Order',
        aggregateId: confirmed.id,
        topic: KAFKA_TOPICS.ORDER_EVENTS,
        eventType: 'order.payment_succeeded',
        payload: {
          eventId: randomUUID(),
          type: 'order.payment_succeeded',
          orderId: confirmed.id,
          orderNumber: confirmed.orderNumber,
          userId: confirmed.userId,
          status: confirmed.status,
          previousStatus: order.status,
          totalPaise: confirmed.totalPaise,
          utrNumber,
          occurredAt: new Date().toISOString(),
        },
      });

      return confirmed;
    });

    this.outbox.triggerFlush();
    return { order: updatedOrder, utrNumber, alreadyPaid: false };
  }

  async failUpiPayment(
    userId: string,
    orderId: string,
    reason = 'UPI payment declined or timed out',
    isAdmin = false,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!isAdmin && order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Paid orders cannot be marked as failed');
    }
    if (order.status === OrderStatus.FAILED) {
      return { order };
    }

    const latestPayment = order.payments[0];

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      if (latestPayment) {
        await tx.paymentTransaction.update({
          where: { id: latestPayment.id },
          data: {
            status: PaymentTxStatus.FAILED,
            metadata: { reason } as Prisma.InputJsonValue,
          },
        });
      }

      for (const item of order.items) {
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

      const failed = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.FAILED,
          paymentStatus: PaymentStatus.FAILED,
        },
        include: {
          items: true,
          payments: { orderBy: { createdAt: 'desc' } },
        },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'Order',
        aggregateId: failed.id,
        topic: KAFKA_TOPICS.ORDER_EVENTS,
        eventType: 'order.payment_failed',
        payload: {
          eventId: randomUUID(),
          type: 'order.payment_failed',
          orderId: failed.id,
          orderNumber: failed.orderNumber,
          userId: failed.userId,
          status: failed.status,
          previousStatus: order.status,
          totalPaise: failed.totalPaise,
          reason,
          occurredAt: new Date().toISOString(),
        },
      });

      return failed;
    });

    this.outbox.triggerFlush();
    return { order: updatedOrder };
  }

  async handleRazorpayWebhook(
    signature: string | undefined,
    payload: {
      event?: string;
      payload?: {
        payment?: {
          entity?: {
            id?: string;
            acquirer_data?: { rrn?: string };
            notes?: { orderId?: string };
            error_description?: string;
          };
        };
      };
    },
  ) {
    if (this.razorpayWebhookSecret) {
      const expected = createHmac('sha256', this.razorpayWebhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');
      if (signature !== expected) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    const paymentEntity = payload?.payload?.payment?.entity;
    const orderId = paymentEntity?.notes?.orderId;
    if (!orderId) {
      return { ignored: true };
    }

    if (payload.event === 'payment.captured') {
      const utr = paymentEntity?.acquirer_data?.rrn || paymentEntity?.id;
      return this.verifyUpiPayment('', orderId, utr, true);
    }

    if (payload.event === 'payment.failed') {
      return this.failUpiPayment(
        '',
        orderId,
        paymentEntity?.error_description || 'UPI payment failed at gateway',
        true,
      );
    }

    return { ignored: true };
  }
}

