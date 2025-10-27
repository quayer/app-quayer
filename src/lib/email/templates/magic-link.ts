/**
 * Magic Link Email Template
 */

import { getBaseEmailTemplate } from './base';

export interface MagicLinkEmailTemplateProps {
  name?: string;
  magicLink: string;
  expirationMinutes?: number;
}

export function getMagicLinkEmailTemplate({
  name,
  magicLink,
  expirationMinutes = 15
}: MagicLinkEmailTemplateProps): string {
  const greeting = name ? name.split(' ')[0] : 'Usuário';

  const content = `
    <h1>Login Mágico 🪄</h1>

    <p>
      Olá${name ? `, ${greeting}` : ''}!
    </p>

    <p>
      Clique no botão abaixo para fazer login automaticamente no Quayer.
      Sem senha necessária!
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${magicLink}" class="button" style="display: inline-block; padding: 12px 32px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
        🔐 Fazer Login Agora
      </a>
    </div>

    <div class="info-box">
      <p>
        <strong>⏱️ Este link expira em ${expirationMinutes} minutos</strong> e pode ser usado apenas uma vez.
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
      ${magicLink}
    </p>

    <div class="divider"></div>

    <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 12px;">
      Não solicitou este login?
    </h2>

    <p>
      Se você não tentou fazer login, pode ignorar este e-mail com segurança.
      Ninguém terá acesso à sua conta sem este link único.
    </p>

    <div class="info-box" style="background-color: #fef2f2; border-left-color: #dc2626;">
      <p style="color: #991b1b;">
        <strong>🛡️ Dica de Segurança:</strong> Nunca compartilhe este link com ninguém.
        Links mágicos são pessoais e intransferíveis.
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
    preheader: `Seu link mágico para login. Expira em ${expirationMinutes} minutos.`
  });
}
