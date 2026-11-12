import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID', '').trim();
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET', '').trim();
    if (!clientId || !clientSecret) {
      const res = context.switchToHttp().getResponse<Response>();
      const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
      res.redirect(`${frontendUrl}/login?error=google_not_configured`);
      return false;
    }
    return super.canActivate(context);
  }
}

