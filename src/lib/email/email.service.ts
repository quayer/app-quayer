/**
 * Email Service - SMTP Provider with Gmail
 * Uses nodemailer for real email sending
 */

import nodemailer from 'nodemailer';
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
 * SMTP Email Provider (Production)
 */
class SMTPEmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    console.log('📧 SMTP Email Provider initialized with:', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
    });
  }

  async send(params: SendEmailParams): Promise<void> {
    const from = params.from || `${process.env.EMAIL_FROM_NAME || 'Quayer'} <${process.env.EMAIL_FROM || 'noreply@quayer.com'}>`;

    console.log('\n========== 📧 ENVIANDO EMAIL REAL ==========');
    console.log('Para:', params.to);
    console.log('Assunto:', params.subject);
    console.log('De:', from);
    console.log('==========================================\n');

    try {
      const info = await this.transporter.sendMail({
        from,
        to: Array.isArray(params.to) ? params.to.join(', ') : params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        replyTo: params.replyTo,
        cc: params.cc?.join(', '),
        bcc: params.bcc?.join(', '),
      });

      console.log('✅ Email enviado com sucesso!');
      console.log('Message ID:', info.messageId);
      console.log('Response:', info.response);
      console.log('==========================================\n');
    } catch (error) {
      console.error('❌ Erro ao enviar email:', error);
      throw error;
    }
  }
}

/**
 * Mock Email Provider (Development/Testing)
 */
class MockEmailProvider implements EmailProvider {
  async send(params: SendEmailParams): Promise<void> {
    console.log('\n========== 📧 EMAIL MOCK (NÃO ENVIADO) ==========');
    console.log('Para:', params.to);
    console.log('Assunto:', params.subject);
    console.log('De:', params.from || 'noreply@quayer.com');
    console.log('===============================================\n');
    console.log('Conteúdo HTML (preview):');
    console.log(params.html.substring(0, 200) + '...\n');
  }
}

/**
 * Email Service Singleton
 */
class EmailService {
  private provider: EmailProvider;

  constructor() {
    // Use SMTP provider if credentials are configured, otherwise use Mock
    const hasSmtpConfig = process.env.SMTP_USER && process.env.SMTP_PASSWORD;

    if (hasSmtpConfig) {
      this.provider = new SMTPEmailProvider();
      console.log('📧 Email Service initialized with SMTP provider');
    } else {
      this.provider = new MockEmailProvider();
      console.log('⚠️ Email Service initialized with Mock provider (no SMTP credentials)');
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
    const html = getWelcomeEmailTemplate({ name, dashboardUrl });
    return this.send({
      to,
      subject: 'Bem-vindo ao Quayer! 🎉',
      html,
    });
  }

  async sendPasswordResetEmail(to: string, name: string, resetUrl: string, expirationMinutes?: number): Promise<void> {
    const html = getPasswordResetEmailTemplate({ name, resetUrl, expirationMinutes });
    return this.send({
      to,
      subject: 'Recuperação de Senha - Quayer',
      html,
    });
  }

  async sendVerificationEmail(to: string, name: string, code: string, expirationMinutes?: number): Promise<void> {
    const html = getVerificationEmailTemplate({ name, code, expirationMinutes });
    return this.send({
      to,
      subject: 'Verificação de E-mail - Quayer',
      html,
    });
  }

  async sendLoginCodeEmail(to: string, name: string, code: string, magicLink: string, expirationMinutes?: number): Promise<void> {
    const html = getLoginCodeEmailTemplate({ name, code, magicLink, expirationMinutes });
    return this.send({
      to,
      subject: `Código ${code} - Login Quayer 🔐`,
      html,
    });
  }

  async sendWelcomeSignupEmail(to: string, name: string, code: string, magicLink: string, expirationMinutes?: number): Promise<void> {
    const html = getWelcomeSignupEmailTemplate({ name, code, magicLink, expirationMinutes });
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
    const html = invitationTemplate({
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
