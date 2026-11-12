import { Global, Module } from '@nestjs/common';
import { CatalogConsumer } from './catalog.consumer';
import { CatalogSyncService } from './catalog-sync.service';
import { OpenSearchService } from './opensearch.service';
import { SearchController } from './search.controller';

@Global()
@Module({
  controllers: [SearchController],
  providers: [OpenSearchService, CatalogSyncService, CatalogConsumer],
  exports: [OpenSearchService, CatalogSyncService],
})
export class SearchModule {}

