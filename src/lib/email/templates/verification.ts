/**
 * Verification Email Template - Email com código OTP para verificação
 */

import { getBaseEmailTemplate } from './base';

export interface VerificationEmailTemplateProps {
  name: string;
  code: string;
  expirationMinutes?: number;
}

export function getVerificationEmailTemplate({
  name,
  code,
  expirationMinutes = 15
}: VerificationEmailTemplateProps): string {
  const firstName = name.split(' ')[0];

  const content = `
    <h1>Verificação de E-mail ✉️</h1>

    <p>
      Olá, ${firstName}!
    </p>

    <p>
      Para concluir seu cadastro no Quayer, precisamos verificar seu endereço de e-mail.
      Use o código abaixo para confirmar:
    </p>

    <div class="code-box">
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 8px; font-weight: 500;">
        SEU CÓDIGO DE VERIFICAÇÃO
      </p>
      <div class="code">${code}</div>
      <p style="color: #6b7280; font-size: 12px; margin-top: 12px;">
        Este código expira em ${expirationMinutes} minutos
      </p>
    </div>

    <div class="info-box">
      <p>
        <strong>⏱️ Importante:</strong> Por motivos de segurança, este código é válido apenas por ${expirationMinutes} minutos.
      </p>
    </div>

    <div class="divider"></div>

    <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 12px;">
      Não solicitou este código?
    </h2>

    <p>
      Se você não criou uma conta no Quayer, você pode ignorar este e-mail com segurança.
      Ninguém terá acesso à sua conta sem este código de verificação.
    </p>

    <p style="margin-top: 32px; color: #6b7280; font-size: 14px;">
      Caso tenha alguma dúvida, entre em contato com nosso suporte.
    </p>

    <p>
      <strong>Equipe Quayer</strong>
    </p>
  `;

  return getBaseEmailTemplate({
    content,
    preheader: `Seu código de verificação: ${code}. Expira em ${expirationMinutes} minutos.`
  });
}
