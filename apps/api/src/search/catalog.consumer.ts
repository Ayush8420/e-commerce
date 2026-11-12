import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CatalogEventPayload, KAFKA_TOPICS } from '@ecommerce/shared';
import { KafkaService } from '../kafka/kafka.service';
import { OpenSearchService } from './opensearch.service';
import { CatalogSyncService } from './catalog-sync.service';

@Injectable()
export class CatalogConsumer implements OnModuleInit {
  private readonly logger = new Logger(CatalogConsumer.name);

  constructor(
    @Inject(KafkaService) private readonly kafka: KafkaService,
    @Inject(CatalogSyncService) private readonly catalogSync: CatalogSyncService,
    @Inject(OpenSearchService) private readonly openSearch: OpenSearchService,
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
    this.logger.debug(`Consuming catalog event ${event.type} for product ${event.productId}`);
    if (event.type === 'product.deleted') {
      await this.openSearch.deleteProduct(event.productId);
      return;
    }
    await this.catalogSync.syncProductById(event.productId);
  }
}

