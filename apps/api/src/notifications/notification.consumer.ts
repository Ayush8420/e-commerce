import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { KAFKA_TOPICS, NotificationEmailEventPayload } from '@ecommerce/shared';
import { KafkaService } from '../kafka/kafka.service';
import { OutboxService } from '../kafka/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from './mailer.service';

@Injectable()
export class NotificationConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotificationConsumer.name);

  constructor(
    @Inject(KafkaService) private readonly kafka: KafkaService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Optional() @Inject(OutboxService) private readonly outbox?: OutboxService,
  ) { }

  async onModuleInit(): Promise<void> {
    this.outbox?.registerFallbackHandler(KAFKA_TOPICS.NOTIFICATION_EVENTS, async (payload) => {
      if (!this.mailer.hasCredentials()) {
        throw new Error('SMTP credentials not configured');
      }
      await this.handleNotificationEvent(payload as unknown as NotificationEmailEventPayload);
    });

    await this.kafka.registerConsumer(
      'notifications',
      KAFKA_TOPICS.NOTIFICATION_EVENTS,
      async (payload) => {
        await this.handleNotificationEvent(payload as unknown as NotificationEmailEventPayload);
      },
    );
  }

  async handleNotificationEvent(event: NotificationEmailEventPayload): Promise<void> {
    if (!event?.eventId || !event?.to) {
      return;
    }

    const existing = await this.prisma.notificationLog.findUnique({
      where: { eventId: event.eventId },
    });
    if (existing) {
      return;
    }

    try {
      const result = await this.mailer.sendNotification(event);
      await this.prisma.notificationLog.create({
        data: {
          eventId: event.eventId,
          type: event.type,
          recipient: event.to,
          subject: event.subject,
          status: 'SENT',
          providerMsgId: result.messageId,
        },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed sending notification ${event.eventId} to ${event.to}: ${errorMsg}`);
      await this.prisma.notificationLog.create({
        data: {
          eventId: event.eventId,
          type: event.type,
          recipient: event.to,
          subject: event.subject,
          status: 'FAILED',
          error: errorMsg.slice(0, 500),
        },
      });
    }
  }
}

