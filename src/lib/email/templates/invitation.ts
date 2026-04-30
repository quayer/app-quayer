/**
 * Invitation Email Template - Convite para organização
 */

import { getBaseEmailTemplate } from './base';

export interface InvitationEmailTemplateProps {
  inviterName: string;
  organizationName: string;
  invitationUrl: string;
  role: string;
  expiresInDays?: number;
}

const roleLabels: Record<string, string> = {
  master: 'Proprietário',
  manager: 'Gerente',
  user: 'Usuário',
};

export function getInvitationEmailTemplate({
  inviterName,
  organizationName,
  invitationUrl,
  role,
  expiresInDays = 7,
}: InvitationEmailTemplateProps): string {
  const roleLabel = roleLabels[role] || role;

  const content = `
    <h1>Você foi convidado! 🎊</h1>

    <p>
      <strong>${inviterName}</strong> convidou você para fazer parte da organização
      <strong>${organizationName}</strong> no Quayer.
    </p>

    <div class="info-box">
      <p>
        <strong>📋 Detalhes do convite:</strong><br>
        Organização: <strong>${organizationName}</strong><br>
        Sua função: <strong>${roleLabel}</strong>
      </p>
    </div>

    <p>Clique no botão abaixo para aceitar o convite e começar a colaborar:</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${invitationUrl}" class="button" style="display: inline-block; padding: 14px 36px; background-color: #111827; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
        Aceitar Convite →
      </a>
    </div>

    <div class="divider"></div>

    <p style="color: #6b7280; font-size: 13px;">
      Não consegue clicar no botão? Copie e cole o link abaixo no seu navegador:
    </p>

    <p style="background-color: #f9fafb; padding: 12px; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 12px; word-break: break-all; color: #4b5563;">
      ${invitationUrl}
    </p>

    <div class="divider"></div>

    <div class="info-box" style="background-color: #fef3c7; border-left-color: #d97706;">
      <p style="color: #92400e;">
        <strong>⏱️ Atenção:</strong> Este convite expira em ${expiresInDays} dias.
        Após esse prazo, será necessário solicitar um novo convite.
      </p>
    </div>

    <p style="color: #6b7280; font-size: 14px;">
      Se você não esperava este convite, pode ignorar este e-mail com segurança.
      Nenhuma ação será tomada na sua conta.
    </p>

    <p>
      <strong>Equipe Quayer</strong>
    </p>
  `;

  return getBaseEmailTemplate({
    content,
    preheader: `${inviterName} convidou você para ${organizationName} no Quayer como ${roleLabel}.`,
  });
}
