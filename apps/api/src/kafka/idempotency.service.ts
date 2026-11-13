import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async isEventProcessed(consumerGroup: string, eventId: string): Promise<boolean> {
    try {
      const existing = await this.prisma.processedEvent.findUnique({
        where: {
          consumerGroup_eventId: {
            consumerGroup,
            eventId,
          },
        },
      });
      return Boolean(existing);
    } catch {
      return false;
    }
  }

  async markEventProcessed(
    consumerGroup: string,
    eventId: string,
    eventType: string,
  ): Promise<boolean> {
    try {
      await this.prisma.processedEvent.create({
        data: {
          consumerGroup,
          eventId,
          eventType,
        },
      });
      return true;
    } catch {
      // Unique constraint violation (consumerGroup, eventId) means already processed
      return false;
    }
  }
}
