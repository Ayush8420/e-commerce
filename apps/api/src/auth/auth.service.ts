import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { KAFKA_TOPICS } from '@ecommerce/shared';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { AuthenticatedUser } from '../common/auth.decorators';
import { OutboxService } from '../kafka/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { GoogleProfilePayload } from './strategies/google.strategy';

@Injectable()
export class AuthService {
  private readonly refreshExpiresDays: number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {
    this.refreshExpiresDays = Number(this.config.get<string>('JWT_REFRESH_EXPIRES_DAYS', '7'));
  }

  isGoogleConfigured(): boolean {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID', '').trim();
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET', '').trim();
    return Boolean(clientId && clientSecret);
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const verifyToken = randomBytes(24).toString('hex');

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          name: dto.name.trim(),
          passwordHash,
          emailVerifyToken: verifyToken,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatarUrl: true,
          emailVerified: true,
        },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'User',
        aggregateId: created.id,
        topic: KAFKA_TOPICS.NOTIFICATION_EVENTS,
        eventType: 'email.verify',
        payload: {
          eventId: randomUUID(),
          type: 'email.verify',
          to: created.email,
          userId: created.id,
          subject: 'Verify your AetherMart email address',
          data: {
            name: created.name,
            token: verifyToken,
          },
          occurredAt: new Date().toISOString(),
        },
      });

      return created;
    });

    this.outbox.triggerFlush();
    return this.createSession(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses Google Sign-In. Continue with Google or reset your password.',
      );
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
    });
  }

  async handleGoogleLogin(profile: GoogleProfilePayload) {
    if (!profile.email) {
      throw new BadRequestException('Google profile did not provide an email address');
    }

    let isNewUser = false;
    const user = await this.prisma.$transaction(async (tx) => {
      const byGoogle = await tx.user.findUnique({ where: { googleId: profile.googleId } });
      if (byGoogle) {
        return tx.user.update({
          where: { id: byGoogle.id },
          data: {
            name: byGoogle.name || profile.name,
            avatarUrl: profile.avatarUrl ?? byGoogle.avatarUrl,
            emailVerified: true,
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            avatarUrl: true,
            emailVerified: true,
          },
        });
      }

      const byEmail = await tx.user.findUnique({ where: { email: profile.email } });
      if (byEmail) {
        return tx.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: profile.googleId,
            avatarUrl: profile.avatarUrl ?? byEmail.avatarUrl,
            emailVerified: true,
            emailVerifyToken: null,
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            avatarUrl: true,
            emailVerified: true,
          },
        });
      }

      isNewUser = true;
      const created = await tx.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          googleId: profile.googleId,
          avatarUrl: profile.avatarUrl,
          emailVerified: true,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatarUrl: true,
          emailVerified: true,
        },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'User',
        aggregateId: created.id,
        topic: KAFKA_TOPICS.NOTIFICATION_EVENTS,
        eventType: 'email.welcome',
        payload: {
          eventId: randomUUID(),
          type: 'email.welcome',
          to: created.email,
          userId: created.id,
          subject: 'Welcome to AetherMart!',
          data: {
            name: created.name,
          },
          occurredAt: new Date().toISOString(),
        },
      });

      return created;
    });

    if (isNewUser) {
      this.outbox.triggerFlush();
    }

    return this.createSession(user);
  }

  async refreshSession(rawRefreshToken: string) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token is missing');
    }
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            avatarUrl: true,
            emailVerified: true,
          },
        },
      },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is expired or revoked');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.createSession(stored.user);
  }

  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async verifyEmail(token: string) {
    if (!token) {
      throw new BadRequestException('Verification token is required');
    }
    const user = await this.prisma.user.findUnique({
      where: { emailVerifyToken: token },
    });
    if (!user) {
      throw new BadRequestException('Verification token is invalid or has already been used');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null },
    });
    return { verified: true, email: user.email };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.emailVerified) {
      return { sent: false, message: 'Email is already verified' };
    }

    const token = user.emailVerifyToken ?? randomBytes(24).toString('hex');
    await this.prisma.$transaction(async (tx) => {
      if (!user.emailVerifyToken) {
        await tx.user.update({
          where: { id: user.id },
          data: { emailVerifyToken: token },
        });
      }
      await this.outbox.enqueue(tx, {
        aggregateType: 'User',
        aggregateId: user.id,
        topic: KAFKA_TOPICS.NOTIFICATION_EVENTS,
        eventType: 'email.verify',
        payload: {
          eventId: randomUUID(),
          type: 'email.verify',
          to: user.email,
          userId: user.id,
          subject: 'Verify your AetherMart email address',
          data: { name: user.name, token },
          occurredAt: new Date().toISOString(),
        },
      });
    });

    this.outbox.triggerFlush();
    return { sent: true };
  }

  async forgotPassword(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { sent: true };
    }

    const resetToken = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: resetToken,
          passwordResetExpiresAt: expiresAt,
        },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'User',
        aggregateId: user.id,
        topic: KAFKA_TOPICS.NOTIFICATION_EVENTS,
        eventType: 'email.password_reset',
        payload: {
          eventId: randomUUID(),
          type: 'email.password_reset',
          to: user.email,
          userId: user.id,
          subject: 'Reset your AetherMart password',
          data: {
            name: user.name,
            token: resetToken,
          },
          occurredAt: new Date().toISOString(),
        },
      });
    });

    this.outbox.triggerFlush();
    return { sent: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { passwordResetToken: token },
    });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new BadRequestException('Password reset token is invalid or expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return { reset: true };
  }

  private async createSession(user: AuthenticatedUser) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const rawRefreshToken = randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + this.refreshExpiresDays * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawRefreshToken),
        expiresAt,
      },
    });

    return {
      user,
      accessToken,
      refreshToken: rawRefreshToken,
      refreshExpiresAt: expiresAt,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

