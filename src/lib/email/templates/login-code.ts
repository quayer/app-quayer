/**
 * Login Code Email Template - OTP + Magic Link Fallback (Vercel-style)
 */

import { getBaseEmailTemplate } from './base';

export interface LoginCodeEmailTemplateProps {
  name?: string;
  code: string;
  magicLink: string;
  expirationMinutes?: number;
}

export function getLoginCodeEmailTemplate({
  name,
  code,
  magicLink,
  expirationMinutes = 10
}: LoginCodeEmailTemplateProps): string {
  const greeting = name ? name.split(' ')[0] : 'Usuário';

  const content = `
    <h1>Seu Código de Login 🔐</h1>

    <p>
      Olá${name ? `, ${greeting}` : ''}!
    </p>

    <p>
      Use o código abaixo para fazer login no Quayer:
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
        <strong>⏱️ Importante:</strong> Por motivos de segurança, este código é válido apenas por ${expirationMinutes} minutos.
      </p>
    </div>

    <div class="divider"></div>

    <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 12px;">
      Não consegue usar o código?
    </h2>

    <p>
      Você também pode fazer login clicando no botão abaixo:
    </p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${magicLink}" class="button" style="display: inline-block; padding: 12px 32px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
        🔐 Fazer Login Automaticamente
      </a>
    </div>

    <p style="color: #6b7280; font-size: 13px; margin-top: 16px;">
      Ou copie e cole o link abaixo no seu navegador:
    </p>

    <p style="background-color: #f9fafb; padding: 12px; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 12px; word-break: break-all; color: #4b5563;">
      ${magicLink}
    </p>

    <div class="divider"></div>

    <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 12px;">
      Não solicitou este login?
    </h2>

    <p>
      Se você não tentou fazer login, pode ignorar este e-mail com segurança.
      Ninguém terá acesso à sua conta sem este código ou link.
    </p>

    <div class="info-box" style="background-color: #fef2f2; border-left-color: #dc2626;">
      <p style="color: #991b1b;">
        <strong>🛡️ Dica de Segurança:</strong> Nunca compartilhe este código ou link com ninguém, nem mesmo com o suporte.
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
    preheader: `Seu código de login: ${code}. Ou use o link no email. Expira em ${expirationMinutes} minutos.`
  });
}
