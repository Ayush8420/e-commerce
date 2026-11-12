import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../common/auth.decorators';
import { JwtAuthGuard } from '../common/auth.guards';
import { PaymentsService } from './payments.service';

class VerifyUpiDto {
  @IsString()
  orderId!: string;

  @IsOptional()
  @IsString()
  utrNumber?: string;
}

class FailUpiDto {
  @IsString()
  orderId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post('upi/verify')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  verifyUpi(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyUpiDto) {
    return this.payments.verifyUpiPayment(
      user.id,
      dto.orderId,
      dto.utrNumber,
      user.role === 'ADMIN',
    );
  }

  @Post('upi/fail')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  failUpi(@CurrentUser() user: AuthenticatedUser, @Body() dto: FailUpiDto) {
    return this.payments.failUpiPayment(
      user.id,
      dto.orderId,
      dto.reason,
      user.role === 'ADMIN',
    );
  }

  @Post('webhook/razorpay')
  @HttpCode(HttpStatus.OK)
  razorpayWebhook(
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.payments.handleRazorpayWebhook(signature, payload as never);
  }
}

