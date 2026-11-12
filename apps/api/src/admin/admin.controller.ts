import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import { PaymentStatus } from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { Roles } from '../common/auth.decorators';
import { JwtAuthGuard, RolesGuard } from '../common/auth.guards';
import { KafkaService } from '../kafka/kafka.service';
import { OutboxService } from '../kafka/outbox.service';
import { MailerService } from '../notifications/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpenSearchService } from '../search/opensearch.service';

class TestEmailDto {
  @IsEmail()
  to!: string;
}

@Controller()
export class AdminController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OpenSearchService) private readonly openSearch: OpenSearchService,
    @Inject(KafkaService) private readonly kafka: KafkaService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}

  @Get('health')
  async health() {
    const [postgresOk, openSearchOk, kafkaOk, smtpOk] = await Promise.all([
      this.prisma
        .$queryRaw`SELECT 1`
        .then(() => true)
        .catch(() => false),
      this.openSearch.isHealthy(),
      this.kafka.isHealthy(),
      this.mailer.verifyConnection(),
    ]);

    return {
      status: postgresOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      neon: {
        branch: process.env.NEON_BRANCH || null,
        branchId: process.env.NEON_BRANCH_ID || null,
      },
      services: {
        postgres: postgresOk ? 'up' : 'down',
        opensearch: openSearchOk ? 'up' : 'down',
        kafka: kafkaOk ? 'up' : 'down',
        smtp: smtpOk ? 'up' : 'down',
      },
    };
  }

  @Get('admin/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async overview() {
    const [
      paidAgg,
      orderCountsRaw,
      productCount,
      userCount,
      lowStockProducts,
      notificationLogs,
      outboxStats,
      analyticsSummary,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { paymentStatus: PaymentStatus.PAID },
        _sum: { totalPaise: true },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.user.count(),
      this.prisma.product.findMany({
        where: { isActive: true, stock: { lte: 10 } },
        orderBy: { stock: 'asc' },
        take: 10,
        select: { id: true, title: true, sku: true, stock: true },
      }),
      this.prisma.notificationLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.outbox.getStats(),
      this.analytics.getSummary(14),
    ]);

    return {
      metrics: {
        gmvPaise: paidAgg._sum.totalPaise ?? 0,
        paidOrdersCount: paidAgg._count._all,
        productCount,
        userCount,
        ordersByStatus: Object.fromEntries(
          orderCountsRaw.map((row) => [row.status, row._count._all]),
        ),
      },
      lowStockProducts,
      notificationLogs,
      outbox: outboxStats,
      analytics: analyticsSummary,
    };
  }

  @Post('admin/outbox/retry')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async retryOutbox() {
    const retried = await this.outbox.retryFailed();
    return { retried };
  }

  @Post('admin/outbox/flush')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async flushOutbox() {
    const published = await this.outbox.flushPending();
    return { published };
  }

  @Post('admin/notifications/test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async sendTestEmail(@Body() dto: TestEmailDto) {
    const result = await this.mailer.sendTestEmail(dto.to);
    return { sent: true, to: dto.to, messageId: result.messageId };
  }
}

