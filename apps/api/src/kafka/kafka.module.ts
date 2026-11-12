import { Global, Module } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [KafkaService, OutboxService],
  exports: [KafkaService, OutboxService],
})
export class KafkaModule {}

