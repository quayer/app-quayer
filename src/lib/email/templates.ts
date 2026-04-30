/**
 * Email Templates
 *
 * Templates HTML responsivos para emails transacionais
 */

/**
 * Layout base para emails
 */
function baseLayout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quayer</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f5f5f5;
      color: #333;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 30px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
      line-height: 1.6;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
    }
    .footer {
      padding: 30px;
      text-align: center;
      font-size: 14px;
      color: #999;
      border-top: 1px solid #eee;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 Quayer</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Quayer. Todos os direitos reservados.</p>
      <p>
        <a href="https://quayer.com">Website</a> •
        <a href="https://quayer.com/docs">Documentação</a> •
        <a href="https://quayer.com/support">Suporte</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Template de boas-vindas
 */
export function welcomeTemplate({ name }: { name: string }): string {
  const content = `
    <h2>Bem-vindo ao Quayer, ${name}! 🎉</h2>
    <p>Estamos muito felizes em ter você conosco!</p>
    <p>O Quayer é a plataforma completa para gerenciamento de instâncias WhatsApp. Com ele, você pode:</p>
    <ul>
      <li>✅ Gerenciar múltiplas instâncias WhatsApp</li>
      <li>✅ Enviar mensagens em lote</li>
      <li>✅ Configurar webhooks personalizados</li>
      <li>✅ Organizar instâncias por projetos</li>
      <li>✅ Controlar permissões de equipe</li>
    </ul>
    <p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/projetos" class="button">
        Acessar Plataforma
      </a>
    </p>
    <p>Se você tiver alguma dúvida, nossa equipe de suporte está sempre disponível para ajudar!</p>
  `;

  return baseLayout(content);
}

/**
 * Template de verificação de email
 */
export function verificationTemplate({
  name,
  verificationUrl,
}: {
  name: string;
  verificationUrl: string;
}): string {
  const content = `
    <h2>Olá ${name},</h2>
    <p>Obrigado por se cadastrar no Quayer!</p>
    <p>Para completar seu cadastro e começar a usar a plataforma, precisamos verificar seu email.</p>
    <p>
      <a href="${verificationUrl}" class="button">
        Verificar Email
      </a>
    </p>
    <p style="color: #999; font-size: 14px;">
      Ou copie e cole este link no seu navegador:<br>
      <code style="background: #f5f5f5; padding: 8px; display: inline-block; margin-top: 8px; border-radius: 4px;">
        ${verificationUrl}
      </code>
    </p>
    <p><strong>Este link expira em 24 horas.</strong></p>
    <p>Se você não criou uma conta no Quayer, pode ignorar este email com segurança.</p>
  `;

  return baseLayout(content);
}

/**
 * Template de reset de senha
 */
export function passwordResetTemplate({
  name,
  resetUrl,
}: {
  name: string;
  resetUrl: string;
}): string {
  const content = `
    <h2>Olá ${name},</h2>
    <p>Recebemos uma solicitação para redefinir a senha da sua conta Quayer.</p>
    <p>Clique no botão abaixo para criar uma nova senha:</p>
    <p>
      <a href="${resetUrl}" class="button">
        Redefinir Senha
      </a>
    </p>
    <p style="color: #999; font-size: 14px;">
      Ou copie e cole este link no seu navegador:<br>
      <code style="background: #f5f5f5; padding: 8px; display: inline-block; margin-top: 8px; border-radius: 4px;">
        ${resetUrl}
      </code>
    </p>
    <p><strong>Este link expira em 1 hora.</strong></p>
    <p style="color: #d9534f;">
      ⚠️ Se você não solicitou a redefinição de senha, por favor ignore este email e considere alterar sua senha por segurança.
    </p>
  `;

  return baseLayout(content);
}

/**
 * Template de convite para organização
 */
export function invitationTemplate({
  inviterName,
  organizationName,
  invitationUrl,
  role,
}: {
  inviterName: string;
  organizationName: string;
  invitationUrl: string;
  role: string;
}): string {
  const roleLabels: Record<string, string> = {
    master: 'Proprietário',
    manager: 'Gerente',
    user: 'Usuário',
  };

  const content = `
    <h2>Você foi convidado! 🎊</h2>
    <p><strong>${inviterName}</strong> convidou você para fazer parte da organização <strong>${organizationName}</strong> no Quayer.</p>
    <p>Sua função será: <strong>${roleLabels[role] || role}</strong></p>
    <p>Clique no botão abaixo para aceitar o convite e começar a colaborar:</p>
    <p>
      <a href="${invitationUrl}" class="button">
        Aceitar Convite
      </a>
    </p>
    <p style="color: #999; font-size: 14px;">
      Ou copie e cole este link no seu navegador:<br>
      <code style="background: #f5f5f5; padding: 8px; display: inline-block; margin-top: 8px; border-radius: 4px;">
        ${invitationUrl}
      </code>
    </p>
    <p><strong>Este convite expira em 7 dias.</strong></p>
    <p>Se você não esperava este convite, pode ignorar este email com segurança.</p>
  `;

  return baseLayout(content);
}

/**
 * Template de instância conectada
 */
export function instanceConnectedTemplate({
  instanceName,
  phoneNumber,
}: {
  instanceName: string;
  phoneNumber: string;
}): string {
  const content = `
    <h2>Instância Conectada com Sucesso! ✅</h2>
    <p>A instância <strong>${instanceName}</strong> foi conectada ao WhatsApp.</p>
    <p>Detalhes da conexão:</p>
    <ul>
      <li><strong>Nome:</strong> ${instanceName}</li>
      <li><strong>Número:</strong> ${phoneNumber}</li>
      <li><strong>Status:</strong> Conectado</li>
      <li><strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}</li>
    </ul>
    <p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/projetos" class="button">
        Ver Instância
      </a>
    </p>
    <p>Agora você pode começar a enviar mensagens através desta instância!</p>
  `;

  return baseLayout(content);
}

/**
 * Template de notificação de erro
 */
export function errorNotificationTemplate({
  title,
  message,
  details,
}: {
  title: string;
  message: string;
  details?: string;
}): string {
  const content = `
    <h2 style="color: #d9534f;">⚠️ ${title}</h2>
    <p>${message}</p>
    ${details ? `<p style="background: #f5f5f5; padding: 16px; border-radius: 4px; font-family: monospace; font-size: 14px;">${details}</p>` : ''}
    <p>Se você precisar de ajuda, entre em contato com nossa equipe de suporte.</p>
    <p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/support" class="button">
        Contatar Suporte
      </a>
    </p>
  `;

  return baseLayout(content);
}
