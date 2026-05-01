interface WelcomeParams { name: string; dashboardUrl?: string }

export function getWelcomeEmailTemplate({ name, dashboardUrl }: WelcomeParams): string {
  return `<h1>Bem-vindo, ${name}!</h1><p>Obrigado por se cadastrar.${dashboardUrl ? ` <a href="${dashboardUrl}">Acessar painel</a>` : ''}</p>`
}
