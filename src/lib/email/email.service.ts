/**
 * Email Service - SMTP Provider with Gmail
 * Uses nodemailer for real email sending
 * Supports editable templates from database
 */

import nodemailer from 'nodemailer';
import { systemSettingsRepository } from '@/features/system-settings/system-settings.repository';
import { getWelcomeEmailTemplate } from './templates/welcome';
import { getVerificationEmailTemplate } from './templates/verification';
import { getLoginCodeEmailTemplate } from './templates/login-code';
import { getWelcomeSignupEmailTemplate } from './templates/welcome-signup';
import { invitationTemplate } from './templates';

/**
 * Replace template variables like {{name}} with actual values
 */
function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  return result;
}

/**
 * Get template from database or fallback to hardcoded
 */
async function getTemplateFromDatabase(
  templateName: string,
  variables: Record<string, string>,
  fallbackHtml: string,
  fallbackSubject: string
): Promise<{ html: string; subject: string }> {
  try {
    const dbTemplate = await systemSettingsRepository.getEmailTemplate(templateName);

    if (dbTemplate && dbTemplate.isActive) {
      console.log(`[EmailService] Using database template: ${templateName}`);
      return {
        html: replaceTemplateVariables(dbTemplate.htmlContent, variables),
        subject: replaceTemplateVariables(dbTemplate.subject, variables),
      };
    }
  } catch (error) {
    console.warn(`[EmailService] Failed to get template from DB, using fallback: ${templateName}`, error);
  }

  // Fallback to hardcoded template
  console.log(`[EmailService] Using fallback template: ${templateName}`);
  return {
    html: fallbackHtml,
    subject: fallbackSubject,
  };
}

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
  private isVerified: boolean = false;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      // Timeouts para evitar bloqueio
      connectionTimeout: 10000, // 10 segundos para conectar
      greetingTimeout: 10000,   // 10 segundos para greeting
      socketTimeout: 30000,     // 30 segundos para operações
    });

    console.log('📧 SMTP Email Provider initialized with:', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
    });

    // Verificar conexão SMTP em background (não bloqueia)
    this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      this.isVerified = true;
      console.log('✅ SMTP connection verified successfully');
    } catch (error) {
      console.error('⚠️ SMTP connection verification failed:', error);
      this.isVerified = false;
    }
  }

  async send(params: SendEmailParams): Promise<void> {
    const from = params.from || `${process.env.EMAIL_FROM_NAME || 'Quayer'} <${process.env.EMAIL_FROM || 'noreply@quayer.com'}>`;

    console.log('\n========== 📧 ENVIANDO EMAIL REAL ==========');
    console.log('Para:', params.to);
    console.log('Assunto:', params.subject);
    console.log('De:', from);
    console.log('SMTP Verified:', this.isVerified);
    console.log('==========================================\n');

    // Timeout wrapper para evitar bloqueio infinito
    const sendWithTimeout = async (): Promise<void> => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('SMTP timeout after 30 seconds')), 30000);
      });

      const sendPromise = this.transporter.sendMail({
        from,
        to: Array.isArray(params.to) ? params.to.join(', ') : params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        replyTo: params.replyTo,
        cc: params.cc?.join(', '),
        bcc: params.bcc?.join(', '),
      });

      return Promise.race([sendPromise, timeoutPromise]).then((info: any) => {
        console.log('✅ Email enviado com sucesso!');
        console.log('Message ID:', info.messageId);
        console.log('Response:', info.response);
        console.log('==========================================\n');
      });
    };

    try {
      await sendWithTimeout();
    } catch (error: any) {
      console.error('❌ Erro ao enviar email:', error.message || error);
      // Não lançar erro para não bloquear o fluxo de autenticação
      // O usuário receberá um código OTP mesmo se o email falhar
      console.warn('⚠️ Email não enviado, mas fluxo continua...');
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
    return this.provider.send(params);
  }

  async sendWelcomeEmail(to: string, name: string, dashboardUrl?: string): Promise<void> {
    const fallbackHtml = getWelcomeEmailTemplate({ name, dashboardUrl });
    const appUrl = dashboardUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://quayer.com';

    const { html, subject } = await getTemplateFromDatabase(
      'welcome',
      { name, appUrl },
      fallbackHtml,
      'Bem-vindo ao Quayer!'
    );

    return this.send({ to, subject, html });
  }

  async sendVerificationEmail(to: string, name: string, code: string, expirationMinutes?: number): Promise<void> {
    const fallbackHtml = getVerificationEmailTemplate({ name, code, expirationMinutes });

    const { html, subject } = await getTemplateFromDatabase(
      'verification',
      { name, code, expirationMinutes: String(expirationMinutes || 10) },
      fallbackHtml,
      'Verificacao de E-mail - Quayer'
    );

    return this.send({ to, subject, html });
  }

  async sendLoginCodeEmail(to: string, name: string, code: string, magicLink: string, expirationMinutes?: number): Promise<void> {
    const fallbackHtml = getLoginCodeEmailTemplate({ name, code, magicLink, expirationMinutes });

    const { html, subject } = await getTemplateFromDatabase(
      'login_code',
      { name, code, magicLink, expirationMinutes: String(expirationMinutes || 10) },
      fallbackHtml,
      `Codigo ${code} - Login Quayer`
    );

    return this.send({ to, subject, html });
  }

  async sendWelcomeSignupEmail(to: string, name: string, code: string, magicLink: string, expirationMinutes?: number): Promise<void> {
    const fallbackHtml = getWelcomeSignupEmailTemplate({ name, code, magicLink, expirationMinutes });

    const { html, subject } = await getTemplateFromDatabase(
      'welcome_signup',
      { name, code, magicLink, expirationMinutes: String(expirationMinutes || 10) },
      fallbackHtml,
      `Codigo ${code} - Bem-vindo ao Quayer!`
    );

    return this.send({ to, subject, html });
  }

  async sendInvitationEmail(
    to: string,
    inviterName: string,
    organizationName: string,
    invitationUrl: string,
    role: string
  ): Promise<void> {
    const fallbackHtml = invitationTemplate({
      inviterName,
      organizationName,
      invitationUrl,
      role,
    });

    const { html, subject } = await getTemplateFromDatabase(
      'invitation',
      { inviterName, organizationName, invitationUrl, role },
      fallbackHtml,
      `Voce foi convidado para ${organizationName} - Quayer`
    );

    return this.send({ to, subject, html });
  }

  async sendPasswordResetEmail(
    to: string,
    name: string,
    resetUrl: string,
    expirationMinutes?: number
  ): Promise<void> {
    const expMinutes = expirationMinutes || 60;
    const fallbackHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Redefinicao de Senha</h2>
          <p>Ola ${name},</p>
          <p>Voce solicitou a redefinicao da sua senha. Clique no botao abaixo para criar uma nova senha:</p>
          <p><a href="${resetUrl}" class="button">Redefinir Senha</a></p>
          <p>Se voce nao solicitou a redefinicao de senha, ignore este email.</p>
          <p>Este link expira em ${expMinutes} minutos.</p>
          <div class="footer">
            <p>Quayer - Sistema de Gestao de WhatsApp</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const { html, subject } = await getTemplateFromDatabase(
      'password_reset',
      { name, resetUrl, expirationMinutes: String(expMinutes) },
      fallbackHtml,
      'Redefinicao de Senha - Quayer'
    );

    return this.send({ to, subject, html });
  }
}

export const emailService = new EmailService();
