import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { KafkaService } from './kafka.service';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [KafkaService, OutboxService, IdempotencyService],
  exports: [KafkaService, OutboxService, IdempotencyService],
})
export class KafkaModule {}

