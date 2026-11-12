import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';

export interface GoogleProfilePayload {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(@Inject(ConfigService) config: ConfigService) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID', '') || 'unconfigured-google-client-id';
    const clientSecret =
      config.get<string>('GOOGLE_CLIENT_SECRET', '') || 'unconfigured-google-client-secret';
    const callbackURL = config.get<string>(
      'GOOGLE_CALLBACK_URL',
      'http://localhost:4000/api/auth/google/callback',
    );

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): GoogleProfilePayload {
    const email = profile.emails?.[0]?.value ?? '';
    const name = profile.displayName || email.split('@')[0] || 'Google User';
    const avatarUrl = profile.photos?.[0]?.value ?? null;
    return {
      googleId: profile.id,
      email: email.toLowerCase(),
      name,
      avatarUrl,
    };
  }
}

