import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { NotificationConsumer } from './notification.consumer';

@Global()
@Module({
  providers: [MailerService, NotificationConsumer],
  exports: [MailerService, NotificationConsumer],
})
export class NotificationsModule {}

