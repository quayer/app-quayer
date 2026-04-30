/**
 * Welcome Signup Email Template - First Time User with OTP + Magic Link
 */

import { getBaseEmailTemplate } from './base';

export interface WelcomeSignupEmailTemplateProps {
  name: string;
  code: string;
  magicLink: string;
  expirationMinutes?: number;
}

export function getWelcomeSignupEmailTemplate({
  name,
  code,
  magicLink,
  expirationMinutes = 10
}: WelcomeSignupEmailTemplateProps): string {
  const firstName = name.split(' ')[0];

  const content = `
    <h1>Bem-vindo ao Quayer! 🎉</h1>

    <p style="font-size: 18px; color: #111827; font-weight: 500;">
      Olá, ${firstName}!
    </p>

    <p>
      Estamos muito felizes em tê-lo(a) conosco! Você está a um passo de acessar sua conta.
    </p>

    <p>
      Use o código abaixo para verificar seu e-mail e criar sua conta:
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

    <div class="info-box" style="background-color: #f0fdf4; border-left-color: #10b981;">
      <p style="color: #047857;">
        <strong>✨ Primeira vez aqui?</strong> Após verificar seu e-mail, você terá acesso a todas as funcionalidades do Quayer.
      </p>
    </div>

    <div class="divider"></div>

    <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 12px;">
      Preferindo usar um link?
    </h2>

    <p>
      Você também pode verificar sua conta clicando no botão abaixo:
    </p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${magicLink}" class="button" style="display: inline-block; padding: 12px 32px; background-color: #111827; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
        🚀 Verificar Minha Conta
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
      O que vem a seguir?
    </h2>

    <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 16px 0;">
      <p style="margin-bottom: 12px; color: #111827; font-weight: 500;">
        Após verificar sua conta, você poderá:
      </p>
      <ul style="margin: 0; padding-left: 24px; color: #4b5563;">
        <li style="margin-bottom: 8px;">Conectar sua primeira integração WhatsApp</li>
        <li style="margin-bottom: 8px;">Configurar webhooks personalizados</li>
        <li style="margin-bottom: 8px;">Gerenciar mensagens e contatos</li>
        <li style="margin-bottom: 8px;">Acessar relatórios e analytics</li>
      </ul>
    </div>

    <div class="info-box">
      <p>
        <strong>💡 Precisa de ajuda?</strong> Confira nosso <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://quayer.com'}/docs" style="color: #6366f1; text-decoration: none;">guia de primeiros passos</a> ou entre em contato com nosso suporte.
      </p>
    </div>

    <div class="divider"></div>

    <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 12px;">
      Não criou esta conta?
    </h2>

    <p>
      Se você não solicitou a criação desta conta, pode ignorar este e-mail com segurança.
      Nenhuma ação será tomada e nenhuma conta será criada sem sua verificação.
    </p>

    <div class="info-box" style="background-color: #fef2f2; border-left-color: #dc2626;">
      <p style="color: #991b1b;">
        <strong>🛡️ Dica de Segurança:</strong> Nunca compartilhe este código ou link com ninguém, nem mesmo com o suporte.
      </p>
    </div>

    <p style="margin-top: 32px; color: #6b7280; font-size: 14px;">
      Estamos ansiosos para ver o que você vai construir! 🚀
    </p>

    <p>
      <strong>Equipe Quayer</strong>
    </p>
  `;

  return getBaseEmailTemplate({
    content,
    preheader: `Bem-vindo ao Quayer! Seu código de verificação: ${code}. Ou use o link no email.`
  });
}
