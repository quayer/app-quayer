/**
 * Password Reset Email Template - Email de recuperação de senha
 */

import { getBaseEmailTemplate } from './base';

export interface PasswordResetEmailTemplateProps {
  name: string;
  resetUrl: string;
  expirationMinutes?: number;
}

export function getPasswordResetEmailTemplate({
  name,
  resetUrl,
  expirationMinutes = 60
}: PasswordResetEmailTemplateProps): string {
  const firstName = name.split(' ')[0];

  const content = `
    <h1>Recuperação de Senha 🔐</h1>

    <p>
      Olá, ${firstName}!
    </p>

    <p>
      Recebemos uma solicitação para redefinir a senha da sua conta Quayer.
      Se você fez esta solicitação, clique no botão abaixo para criar uma nova senha:
    </p>

    <div style="text-align: center;">
      <a href="${resetUrl}" class="button">
        Redefinir Minha Senha
      </a>
    </div>

    <div class="info-box">
      <p>
        <strong>⏱️ Este link é válido por ${expirationMinutes} minutos</strong> e pode ser usado apenas uma vez.
        Após este período, você precisará solicitar uma nova recuperação de senha.
      </p>
    </div>

    <div class="divider"></div>

    <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 12px;">
      Não consegue clicar no botão?
    </h2>

    <p>
      Copie e cole o link abaixo no seu navegador:
    </p>

    <p style="background-color: #f9fafb; padding: 12px; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 13px; word-break: break-all; color: #4b5563;">
      ${resetUrl}
    </p>

    <div class="divider"></div>

    <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 12px;">
      Não solicitou esta recuperação?
    </h2>

    <p>
      Se você não solicitou a redefinição de senha, você pode ignorar este e-mail com segurança.
      Sua senha permanecerá inalterada e sua conta continua protegida.
    </p>

    <div class="info-box" style="background-color: #fef2f2; border-left-color: #dc2626;">
      <p style="color: #991b1b;">
        <strong>🛡️ Dica de Segurança:</strong> Sempre verifique se o remetente é legítimo antes de clicar em links de e-mail.
        Nunca compartilhe sua senha com ninguém.
      </p>
    </div>

    <p style="margin-top: 32px; color: #6b7280; font-size: 14px;">
      Caso tenha alguma dúvida ou suspeite de atividade não autorizada, entre em contato com nosso suporte imediatamente.
    </p>

    <p>
      <strong>Equipe Quayer</strong>
    </p>
  `;

  return getBaseEmailTemplate({
    content,
    preheader: `Solicitação de recuperação de senha recebida. O link expira em ${expirationMinutes} minutos.`
  });
}
