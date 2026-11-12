import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export function buildPrismaDatasourceUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) {
    return undefined;
  }
  try {
    const parsed = new URL(rawUrl);
    // Neon pooled (-pooler) endpoints run PgBouncer in transaction mode; Prisma requires pgbouncer=true
    if (parsed.hostname.includes('-pooler.') && !parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true');
    }
    if (parsed.hostname.includes('.neon.tech') && !parsed.searchParams.has('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', '15');
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const datasourceUrl = buildPrismaDatasourceUrl(process.env.DATABASE_URL);
    super({
      ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
      transactionOptions: {
        maxWait: 10000,
        timeout: 25000,
      },
    });
  }

  onModuleInit(): void {
    if (process.env.SKIP_INFRA_BOOT === 'true') {
      return;
    }
    void this.$connect()
      .then(() => {
        this.logger.log('Connected to PostgreSQL via Prisma');
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `PostgreSQL unavailable at boot (${error instanceof Error ? error.message.split('\n')[0] : String(error)}). Auth/orders require PostgreSQL.`,
        );
      });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect().catch(() => undefined);
  }
}
