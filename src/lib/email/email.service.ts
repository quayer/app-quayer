/**
 * Email Service — Resend transactional provider with on-disk mock fallback.
 *
 * Provider selection:
 *   - RESEND_API_KEY set AND EMAIL_PROVIDER != 'mock' → Resend
 *   - otherwise → MockEmailProvider (writes to tmp/test-inbox for E2E tests)
 */

import { Resend } from 'resend';
import { getWelcomeEmailTemplate } from './templates/welcome';
import { getVerificationEmailTemplate } from './templates/verification';
import { getPasswordResetEmailTemplate } from './templates/password-reset';
import { getLoginCodeEmailTemplate } from './templates/login-code';
import { getWelcomeSignupEmailTemplate } from './templates/welcome-signup';
import { invitationTemplate } from './templates';

export interface EmailProvider {
  send(params: SendEmailParams): Promise<void>;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
}

/**
 * Resend Email Provider (Production)
 */
class ResendEmailProvider implements EmailProvider {
  private client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
    console.log('📧 Email provider: Resend');
  }

  async send(params: SendEmailParams): Promise<void> {
    const fromName = process.env.EMAIL_FROM_NAME || 'Quayer';
    const fromEmail = process.env.EMAIL_FROM || 'noreply@quayer.com';
    const from = params.from || `${fromName} <${fromEmail}>`;

    const result = await this.client.emails.send({
      from,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
      cc: params.cc,
      bcc: params.bcc,
    });

    if (result.error) {
      console.error('❌ Resend send failed:', result.error);
      throw new Error(`Resend send failed: ${result.error.message}`);
    }

    const recipient = Array.isArray(params.to) ? params.to.join(', ') : params.to;
    console.log(`✅ Email sent via Resend → ${recipient} (id: ${result.data?.id})`);
  }
}

/**
 * Mock Email Provider (Development/Testing)
 *
 * Writes a JSON record of every "sent" email to an on-disk inbox so tests
 * (especially E2E) can extract OTP codes and magic links without hitting a
 * real email service. Each email becomes one file at:
 *
 *   ${EMAIL_INBOX_DIR ?? 'tmp/test-inbox'}/{ISO_TS}-{slug(to)}.json
 *
 * Test helpers in `test/helpers/inbox.ts` read this directory.
 *
 * The disk write is best-effort; if it fails (e.g., FS readonly) we still
 * log to console so dev usage is not blocked.
 */
class MockEmailProvider implements EmailProvider {
  private readonly inboxDir: string;

  constructor() {
    this.inboxDir = process.env.EMAIL_INBOX_DIR ?? 'tmp/test-inbox';
  }

  async send(params: SendEmailParams): Promise<void> {
    console.log('\n========== 📧 EMAIL MOCK (NÃO ENVIADO) ==========');
    console.log('Para:', params.to);
    console.log('Assunto:', params.subject);
    console.log('De:', params.from || process.env.EMAIL_FROM || 'noreply@quayer.com');
    console.log('===============================================\n');
    console.log('Conteúdo HTML (preview):');
    console.log(params.html.substring(0, 200) + '...\n');

    await this.writeInbox(params).catch((err) => {
      console.warn('[MockEmailProvider] inbox write failed:', err);
    });
  }

  private async writeInbox(params: SendEmailParams): Promise<void> {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const path = await import('node:path');

    await mkdir(this.inboxDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const to = Array.isArray(params.to) ? params.to[0] : params.to;
    const slug = (to ?? 'unknown').replace(/[^a-z0-9@.+-]/gi, '_');
    const filename = `${ts}-${slug}.json`;

    const record = {
      sentAt: new Date().toISOString(),
      from: params.from || process.env.EMAIL_FROM || 'noreply@quayer.com',
      to: params.to,
      cc: params.cc ?? null,
      bcc: params.bcc ?? null,
      replyTo: params.replyTo ?? null,
      subject: params.subject,
      html: params.html,
      text: params.text ?? null,
    };

    await writeFile(path.join(this.inboxDir, filename), JSON.stringify(record, null, 2), 'utf8');
  }
}

/**
 * Email Service Singleton
 */
class EmailService {
  private provider: EmailProvider;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    const forceMock = process.env.EMAIL_PROVIDER === 'mock';

    if (apiKey && !forceMock) {
      this.provider = new ResendEmailProvider(apiKey);
    } else {
      this.provider = new MockEmailProvider();
      const reason = forceMock ? 'EMAIL_PROVIDER=mock' : 'no RESEND_API_KEY';
      console.log(`⚠️ Email provider: Mock (${reason})`);
    }
  }

  async send(params: SendEmailParams): Promise<void> {
    const blocklist = (process.env.EMAIL_BLOCKLIST || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (blocklist.length > 0) {
      const recipients = Array.isArray(params.to) ? params.to : [params.to];
      const blocked = recipients.filter((r) => blocklist.includes(r.toLowerCase()));
      if (blocked.length > 0) {
        console.log(`📧 Email bloqueado para: ${blocked.join(', ')} (EMAIL_BLOCKLIST)`);
        return;
      }
    }

    return this.provider.send(params);
  }

  async sendWelcomeEmail(to: string, name: string, dashboardUrl?: string): Promise<void> {
    const html = await getWelcomeEmailTemplate({ name, dashboardUrl });
    return this.send({
      to,
      subject: 'Bem-vindo ao Quayer! 🎉',
      html,
    });
  }

  async sendPasswordResetEmail(to: string, name: string, resetUrl: string, expirationMinutes?: number): Promise<void> {
    const html = await getPasswordResetEmailTemplate({ name, resetUrl, expirationMinutes });
    return this.send({
      to,
      subject: 'Recuperação de Senha - Quayer',
      html,
    });
  }

  async sendVerificationEmail(to: string, name: string, code: string, expirationMinutes?: number): Promise<void> {
    const html = await getVerificationEmailTemplate({ name, code, expirationMinutes });
    return this.send({
      to,
      subject: 'Verificação de E-mail - Quayer',
      html,
    });
  }

  async sendLoginCodeEmail(to: string, name: string, code: string, magicLink: string, expirationMinutes?: number): Promise<void> {
    const html = await getLoginCodeEmailTemplate({ name, code, magicLink, expirationMinutes });
    return this.send({
      to,
      subject: `Código ${code} - Login Quayer 🔐`,
      html,
    });
  }

  async sendWelcomeSignupEmail(to: string, name: string, code: string, magicLink: string, expirationMinutes?: number): Promise<void> {
    const html = await getWelcomeSignupEmailTemplate({ name, code, magicLink, expirationMinutes });
    return this.send({
      to,
      subject: `Código ${code} - Bem-vindo ao Quayer! 🎉`,
      html,
    });
  }

  async sendInvitationEmail(
    to: string,
    inviterName: string,
    organizationName: string,
    invitationUrl: string,
    role: string
  ): Promise<void> {
    const html = await invitationTemplate({
      inviterName,
      organizationName,
      invitationUrl,
      role,
    });
    return this.send({
      to,
      subject: `Você foi convidado para ${organizationName} - Quayer 🎊`,
      html,
    });
  }
}

export const emailService = new EmailService();
