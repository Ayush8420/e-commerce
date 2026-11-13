import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { AnalyticsEventPayload, KAFKA_TOPICS } from '@ecommerce/shared';
import { randomUUID } from 'crypto';
import { AuthenticatedUser, CurrentUser } from '../common/auth.decorators';
import { OptionalJwtAuthGuard } from '../common/auth.guards';
import { KafkaService } from '../kafka/kafka.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpenSearchService, SearchQueryInput } from './opensearch.service';

@Controller('search')
export class SearchController {
  constructor(
    @Inject(OpenSearchService) private readonly openSearch: OpenSearchService,
    @Inject(KafkaService) private readonly kafka: KafkaService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async search(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('city') city?: string,
    @Query('storeId') storeId?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('minRating') minRating?: string,
    @Query('inStock') inStock?: string,
    @Query('sort') sort?: SearchQueryInput['sort'],
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Req() req?: { headers?: Record<string, string | string[] | undefined> },
  ) {
    const parsed: SearchQueryInput = {
      q,
      category,
      brand,
      city,
      storeId,
      minPricePaise: minPrice !== undefined && minPrice !== '' ? Number(minPrice) * 100 : undefined,
      maxPricePaise: maxPrice !== undefined && maxPrice !== '' ? Number(maxPrice) * 100 : undefined,
      minRating: minRating !== undefined && minRating !== '' ? Number(minRating) : undefined,
      inStock: inStock === 'true',
      sort,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 12,
    };

    const result = await this.openSearch.searchProducts(parsed);

    if (q && q.trim().length > 0) {
      const event: AnalyticsEventPayload = {
        eventId: randomUUID(),
        type: 'search.performed',
        userId: user?.id,
        sessionId: String(req?.headers?.['x-session-id'] ?? ''),
        query: q.trim().toLowerCase(),
        metadata: {
          totalResults: result.total,
          category: category ?? null,
          searchEngine: result.searchEngine,
        },
        occurredAt: new Date().toISOString(),
      };
      this.publishAnalyticsAsync(event);
    }

    return result;
  }

  @Get('suggest')
  async suggest(@Query('q') q = '') {
    const suggestions = await this.openSearch.suggestProducts(q);
    return { suggestions };
  }

  private publishAnalyticsAsync(event: AnalyticsEventPayload): void {
    void this.kafka
      .publish(KAFKA_TOPICS.ANALYTICS_EVENTS, event.userId || event.sessionId || 'anon', event)
      .catch(async () => {
        await this.prisma.analyticsEvent
          .create({
            data: {
              eventId: event.eventId,
              type: event.type,
              userId: event.userId ?? null,
              sessionId: event.sessionId ?? null,
              query: event.query ?? null,
              metadata: (event.metadata ?? {}) as object,
              occurredAt: new Date(event.occurredAt),
            },
          })
          .catch(() => undefined);
      });
  }
}

