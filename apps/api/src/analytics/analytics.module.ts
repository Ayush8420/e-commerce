import { Global, Module } from '@nestjs/common';
import { AnalyticsConsumer } from './analytics.consumer';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Global()
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsConsumer, AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

