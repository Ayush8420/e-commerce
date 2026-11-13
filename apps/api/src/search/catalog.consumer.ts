import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { CatalogEventPayload, KAFKA_TOPICS } from '@ecommerce/shared';
import { IdempotencyService } from '../kafka/idempotency.service';
import { KafkaService } from '../kafka/kafka.service';
import { OpenSearchService } from './opensearch.service';
import { CatalogSyncService } from './catalog-sync.service';
import { SystemActivityService } from '../system/system-activity.service';

@Injectable()
export class CatalogConsumer implements OnModuleInit {
  private readonly logger = new Logger(CatalogConsumer.name);

  constructor(
    @Inject(KafkaService) private readonly kafka: KafkaService,
    @Inject(CatalogSyncService) private readonly catalogSync: CatalogSyncService,
    @Inject(OpenSearchService) private readonly openSearch: OpenSearchService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Optional()
    @Inject(SystemActivityService)
    private readonly activity?: SystemActivityService,
  ) { }

  async onModuleInit(): Promise<void> {
    await this.kafka.registerConsumer(
      'catalog-opensearch-sync',
      KAFKA_TOPICS.CATALOG_EVENTS,
      async (payload) => {
        await this.handleCatalogEvent(payload as unknown as CatalogEventPayload);
      },
    );
  }

  async handleCatalogEvent(event: CatalogEventPayload): Promise<void> {
    if (!event?.productId) {
      return;
    }

    if (event.eventId) {
      const alreadyProcessed = await this.idempotency.isEventProcessed(
        'catalog-opensearch-sync',
        event.eventId,
      );
      if (alreadyProcessed) {
        this.logger.debug(
          `[Idempotency] Skipping duplicate catalog event ${event.eventId} (${event.type})`,
        );
        return;
      }
    }

    this.logger.debug(`Consuming catalog event ${event.type} for product ${event.productId}`);
    if (event.type === 'product.deleted') {
      await this.openSearch.deleteProduct(event.productId);
      this.activity?.record({
        service: 'OpenSearch',
        step: 'opensearch_doc_indexed',
        title: `Removed deleted product ${event.productId} from OpenSearch`,
        details: { productId: event.productId, type: event.type },
      });
    } else {
      await this.catalogSync.syncProductById(event.productId);
      this.activity?.record({
        service: 'OpenSearch',
        step: 'opensearch_doc_indexed',
        title: `Synchronized product ${event.productId} to OpenSearch index`,
        details: { productId: event.productId, type: event.type },
      });
    }

    if (event.eventId) {
      await this.idempotency.markEventProcessed('catalog-opensearch-sync', event.eventId, event.type);
    }
  }
}

