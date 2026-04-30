/**
 * Welcome Email Template - Email de boas-vindas
 */

import { getBaseEmailTemplate } from './base';

export interface WelcomeEmailTemplateProps {
  name: string;
  dashboardUrl?: string;
}

export function getWelcomeEmailTemplate({ name, dashboardUrl = 'https://quayer.com/dashboard' }: WelcomeEmailTemplateProps): string {
  const firstName = name.split(' ')[0];

  const content = `
    <h1>Bem-vindo ao Quayer, ${firstName}! 🎉</h1>

    <p>
      Estamos muito felizes em ter você conosco! Sua conta foi criada com sucesso e você já pode começar a explorar todas as funcionalidades da plataforma.
    </p>

    <p>
      O Quayer é a sua solução completa para gestão de comunicação e integração com WhatsApp. Aqui você pode:
    </p>

    <ul style="color: #4b5563; font-size: 16px; line-height: 1.8; margin: 24px 0; padding-left: 20px;">
      <li>Gerenciar múltiplas instâncias do WhatsApp</li>
      <li>Automatizar o envio de mensagens</li>
      <li>Integrar com suas ferramentas favoritas via API</li>
      <li>Monitorar métricas e analytics em tempo real</li>
    </ul>

    <div style="text-align: center;">
      <a href="${dashboardUrl}" class="button">
        Acessar Dashboard
      </a>
    </div>

    <div class="divider"></div>

    <h2 style="font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 16px;">
      Próximos Passos
    </h2>

    <p>
      <strong>1. Configure sua primeira instância</strong><br>
      Conecte seu WhatsApp e comece a enviar mensagens.
    </p>

    <p>
      <strong>2. Explore a documentação</strong><br>
      Aprenda como integrar o Quayer com seus sistemas.
    </p>

    <p>
      <strong>3. Personalize suas configurações</strong><br>
      Ajuste webhooks, delays e preferências da sua conta.
    </p>

    <div class="info-box">
      <p>
        <strong>💡 Dica:</strong> Precisa de ajuda? Nossa equipe está sempre disponível através do suporte em tempo real no dashboard.
      </p>
    </div>

    <p style="margin-top: 32px;">
      Obrigado por escolher o Quayer!
    </p>

    <p>
      <strong>Equipe Quayer</strong>
    </p>
  `;

  return getBaseEmailTemplate({
    content,
    preheader: `Bem-vindo ao Quayer, ${firstName}! Sua conta foi criada com sucesso.`
  });
}
