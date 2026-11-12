import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatInrFromPaise, NotificationEmailEventPayload } from '@ecommerce/shared';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;
  private readonly frontendUrl: string;
  private readonly credentialsConfigured: boolean;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const service = this.config.get<string>('SMTP_SERVICE', '').trim();
    const host = this.config.get<string>('SMTP_HOST', 'smtp.gmail.com').trim();
    const port = Number(this.config.get<string>('SMTP_PORT', '465'));
    const secure = this.config.get<string>('SMTP_SECURE', 'true') === 'true' || port === 465;
    const user = this.config.get<string>('SMTP_USER', '').trim();
    const rawPass = this.config.get<string>('SMTP_PASS', '').trim();
    const isGmail = service.toLowerCase() === 'gmail' || host.toLowerCase() === 'smtp.gmail.com';
    // Google App Passwords are often copied with spaces ("abcd efgh ijkl mnop")
    const pass = isGmail ? rawPass.replace(/\s+/g, '') : rawPass;

    this.credentialsConfigured = isGmail ? Boolean(user && pass) : Boolean(host);

    const configuredFrom = this.config.get<string>('SMTP_FROM', '').trim();
    if (configuredFrom && (!isGmail || !configuredFrom.endsWith('.local>'))) {
      this.fromAddress = configuredFrom;
    } else if (user) {
      this.fromAddress = `AetherMart <${user}>`;
    } else {
      this.fromAddress = 'AetherMart <no-reply@aethermart.local>';
    }
    this.frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');

    this.transporter = nodemailer.createTransport({
      ...(isGmail ? { service: 'gmail' } : { host }),
      port,
      secure,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

  hasCredentials(): boolean {
    return this.credentialsConfigured;
  }

  async sendNotification(event: NotificationEmailEventPayload): Promise<{ messageId: string }> {
    const { html, text } = this.renderTemplate(event);
    const info = await this.transporter.sendMail({
      from: this.fromAddress,
      to: event.to,
      subject: event.subject,
      text,
      html,
    });
    this.logger.log(`Email [${event.type}] sent to ${event.to} (${info.messageId})`);
    return { messageId: info.messageId };
  }

  async sendTestEmail(to: string): Promise<{ messageId: string }> {
    return this.sendNotification({
      eventId: `test-${Date.now()}`,
      type: 'email.welcome',
      to,
      subject: 'AetherMart Gmail SMTP Test',
      data: { name: 'Store Admin' },
      occurredAt: new Date().toISOString(),
    });
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.credentialsConfigured) {
      return false;
    }
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  renderTemplate(event: NotificationEmailEventPayload): { html: string; text: string } {
    const data = event.data ?? {};
    const name = String(data.name ?? 'Customer');

    switch (event.type) {
      case 'email.welcome':
      case 'email.verify': {
        const token = String(data.token ?? '');
        const verifyUrl = `${this.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
        const text = `Hi ${name},\n\nWelcome to AetherMart! Please verify your email address:\n${verifyUrl}\n`;
        const html = this.wrapLayout(
          `Welcome to AetherMart, ${this.escapeHtml(name)}`,
          `<p>Thanks for creating your account. Confirm your email address to unlock order notifications and faster UPI checkout.</p>
           ${token ? `<p style="margin:24px 0;"><a href="${verifyUrl}" style="background:#111827;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Verify Email Address</a></p>` : ''}`,
        );
        return { html, text };
      }

      case 'email.password_reset': {
        const token = String(data.token ?? '');
        const resetUrl = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
        const text = `Hi ${name},\n\nReset your AetherMart password using the link below (valid for 1 hour):\n${resetUrl}\n`;
        const html = this.wrapLayout(
          'Reset your password',
          `<p>Hi ${this.escapeHtml(name)}, we received a password reset request for your account.</p>
           <p style="margin:24px 0;"><a href="${resetUrl}" style="background:#111827;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a></p>
           <p style="color:#6b7280;font-size:13px;">This link expires in 60 minutes. If you didn't request this, you can safely ignore this email.</p>`,
        );
        return { html, text };
      }

      case 'email.order_confirmed': {
        const orderNumber = String(data.orderNumber ?? '');
        const totalPaise = Number(data.totalPaise ?? 0);
        const utrNumber = data.utrNumber ? String(data.utrNumber) : null;
        const orderUrl = `${this.frontendUrl}/orders/${encodeURIComponent(String(data.orderId ?? ''))}`;
        const formattedTotal = formatInrFromPaise(totalPaise);
        const items = Array.isArray(data.items)
          ? (data.items as Array<{ title: string; quantity: number; pricePaise: number }>)
          : [];
        const itemLines = items
          .map(
            (item) =>
              `- ${item.title} x ${item.quantity} (${formatInrFromPaise(item.pricePaise * item.quantity)})`,
          )
          .join('\n');
        const itemRows = items
          .map(
            (item) =>
              `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${this.escapeHtml(item.title)} &times; ${item.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${formatInrFromPaise(item.pricePaise * item.quantity)}</td></tr>`,
          )
          .join('');

        const text = `Hi ${name},\n\nOrder ${orderNumber} is confirmed!\nTotal Paid: ${formattedTotal}${utrNumber ? `\nUPI UTR: ${utrNumber}` : ''}\n\nItems:\n${itemLines}\n\nView order: ${orderUrl}\n`;
        const html = this.wrapLayout(
          `Order Confirmed: ${this.escapeHtml(orderNumber)}`,
          `<p>Hi ${this.escapeHtml(name)}, your payment has been verified and your order is confirmed.</p>
           <p><strong>Total Paid:</strong> ${formattedTotal}${utrNumber ? `<br/><strong>UPI UTR Reference:</strong> ${this.escapeHtml(utrNumber)}` : ''}</p>
           <table style="width:100%;border-collapse:collapse;margin:16px 0;">${itemRows}</table>
           <p style="margin:24px 0;"><a href="${orderUrl}" style="background:#111827;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Track Order</a></p>`,
        );
        return { html, text };
      }

      case 'email.payment_failed': {
        const orderNumber = String(data.orderNumber ?? '');
        const reason = String(data.reason ?? 'UPI transaction could not be completed.');
        const orderUrl = `${this.frontendUrl}/orders/${encodeURIComponent(String(data.orderId ?? ''))}`;
        const text = `Hi ${name},\n\nPayment for order ${orderNumber} failed: ${reason}\nRetry here: ${orderUrl}\n`;
        const html = this.wrapLayout(
          `Payment Failed for ${this.escapeHtml(orderNumber)}`,
          `<p>Hi ${this.escapeHtml(name)}, your recent UPI payment did not succeed.</p>
           <p style="color:#b91c1c;">${this.escapeHtml(reason)}</p>
           <p style="margin:24px 0;"><a href="${orderUrl}" style="background:#111827;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Retry UPI Payment</a></p>`,
        );
        return { html, text };
      }

      case 'email.order_status_updated': {
        const orderNumber = String(data.orderNumber ?? '');
        const status = String(data.status ?? '');
        const orderUrl = `${this.frontendUrl}/orders/${encodeURIComponent(String(data.orderId ?? ''))}`;
        const text = `Hi ${name},\n\nYour order ${orderNumber} status is now: ${status}.\nView details: ${orderUrl}\n`;
        const html = this.wrapLayout(
          `Order ${this.escapeHtml(orderNumber)} is now ${this.escapeHtml(status)}`,
          `<p>Hi ${this.escapeHtml(name)}, there is an update on your order <strong>${this.escapeHtml(orderNumber)}</strong>.</p>
           <p style="font-size:16px;">Current Status: <strong>${this.escapeHtml(status)}</strong></p>
           <p style="margin:24px 0;"><a href="${orderUrl}" style="background:#111827;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Order Timeline</a></p>`,
        );
        return { html, text };
      }

      default: {
        const text = `Hi ${name},\n\n${event.subject}`;
        const html = this.wrapLayout(event.subject, `<p>${this.escapeHtml(event.subject)}</p>`);
        return { html, text };
      }
    }
  }

  private wrapLayout(heading: string, body: string): string {
    return `<!doctype html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;padding:32px 16px;color:#111827;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">AetherMart Commerce</div>
      <h1 style="font-size:22px;margin:0 0 16px 0;">${heading}</h1>
      <div style="font-size:15px;line-height:1.6;color:#374151;">${body}</div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px;" />
      <div style="font-size:12px;color:#9ca3af;">Sent via Kafka Notification Pipeline &bull; AetherMart</div>
    </div>
  </body>
</html>`;
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

