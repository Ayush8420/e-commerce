import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../common/auth.decorators';
import { OptionalJwtAuthGuard } from '../common/auth.guards';
import { AnalyticsService } from './analytics.service';

class TrackAnalyticsDto {
  @IsIn(['search.performed', 'product.viewed', 'cart.item_added', 'checkout.started', 'order.completed'])
  type!: 'search.performed' | 'product.viewed' | 'cart.item_added' | 'checkout.started' | 'order.completed';

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

@Controller('analytics')
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}

  @Post('track')
  @UseGuards(OptionalJwtAuthGuard)
  async track(
    @Body() dto: TrackAnalyticsDto,
    @CurrentUser() user?: AuthenticatedUser,
    @Req() req?: { headers?: Record<string, string | string[] | undefined> },
  ) {
    const sessionId = req?.headers?.['x-session-id']
      ? String(req.headers['x-session-id'])
      : undefined;
    await this.analytics.track({
      ...dto,
      userId: user?.id,
      sessionId,
    });
    return { tracked: true };
  }
}

