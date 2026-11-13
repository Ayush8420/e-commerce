import { Body, Controller, Get, Inject, Post, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { SystemActivityItem, SystemActivityService } from './system-activity.service';
import { OutboxService } from '../kafka/outbox.service';

@Controller('system')
export class SystemController {
  constructor(
    @Inject(SystemActivityService) private readonly activity: SystemActivityService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  @Sse('stream')
  stream(): Observable<{ data: SystemActivityItem }> {
    return this.activity.getStream();
  }

  @Get('activity')
  async getActivity() {
    const recent = this.activity.getRecent();
    const outboxStats = await this.outbox.getStats().catch(() => null);
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      recent,
      outboxStats,
    };
  }

  @Post('stress-test')
  async runStressTest(
    @Body('concurrency') concurrency?: number,
    @Body('initialStock') initialStock?: number,
  ) {
    const n = Math.min(200, Math.max(10, concurrency ?? 100));
    const s = Math.min(50, Math.max(1, initialStock ?? 5));
    return this.activity.runStressTest(n, s);
  }
}
