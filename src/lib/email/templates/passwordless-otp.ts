/**
 * Passwordless OTP Email Template
 */

import { getBaseEmailTemplate } from './base';

export interface PasswordlessOTPEmailTemplateProps {
  name?: string;
  code: string;
  expirationMinutes?: number;
}

export function getPasswordlessOTPEmailTemplate({
  name,
  code,
  expirationMinutes = 10
}: PasswordlessOTPEmailTemplateProps): string {
  const greeting = name ? name.split(' ')[0] : 'Usuário';

  const content = `
    <h1>Código de Login 🔐</h1>

    <p>
      Olá${name ? `, ${greeting}` : ''}!
    </p>

    <p>
      Use o código abaixo para fazer login no Quayer sem senha:
    </p>

    <div class="code-box">
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 8px; font-weight: 500;">
        SEU CÓDIGO DE LOGIN
      </p>
      <div class="code">${code}</div>
      <p style="color: #6b7280; font-size: 12px; margin-top: 12px;">
        Este código expira em ${expirationMinutes} minutos
      </p>
    </div>

    <div class="info-box">
      <p>
        <strong>⏱️ Importante:</strong> Por motivos de segurança, este código é válido apenas por ${expirationMinutes} minutos e pode ser usado apenas uma vez.
      </p>
    </div>

    <div class="divider"></div>

    <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 12px;">
      Não solicitou este código?
    </h2>

    <p>
      Se você não tentou fazer login, você pode ignorar este e-mail com segurança.
      Ninguém terá acesso à sua conta sem este código.
    </p>

    <div class="info-box" style="background-color: #fef2f2; border-left-color: #dc2626;">
      <p style="color: #991b1b;">
        <strong>🛡️ Dica de Segurança:</strong> Nunca compartilhe este código com ninguém, nem mesmo com o suporte.
      </p>
    </div>

    <p style="margin-top: 32px; color: #6b7280; font-size: 14px;">
      Caso tenha alguma dúvida, entre em contato com nosso suporte.
    </p>

    <p>
      <strong>Equipe Quayer</strong>
    </p>
  `;

  return getBaseEmailTemplate({
    content,
    preheader: `Seu código de login: ${code}. Expira em ${expirationMinutes} minutos.`
  });
}
