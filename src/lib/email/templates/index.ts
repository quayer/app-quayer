interface InvitationTemplateParams {
  inviterName: string
  organizationName: string
  invitationUrl: string
  role: string
}

export function invitationTemplate({ inviterName, organizationName, invitationUrl, role }: InvitationTemplateParams): string {
  return `<h1>Convite para ${organizationName}</h1><p>${inviterName} convidou você como ${role}. <a href="${invitationUrl}">Aceitar convite</a></p>`
}
