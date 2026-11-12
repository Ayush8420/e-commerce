import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { OrderConsumer } from './order.consumer';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderConsumer],
  exports: [OrdersService],
})
export class OrdersModule {}

