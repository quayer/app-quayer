/**
 * Base Email Template - Layout principal para todos os emails
 */

export interface BaseEmailTemplateProps {
  content: string;
  preheader?: string;
}

export function getBaseEmailTemplate({ content, preheader }: BaseEmailTemplateProps): string {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://quayer.com').replace(/\/$/, '');

  // Logo inline como texto estilizado para máxima compatibilidade com clientes de email
  const logoHtml = `
    <div style="display: inline-flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 700; color: #111827; text-decoration: none; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      Quayer
    </div>
  `;

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quayer</title>
  ${preheader ? `<meta name="description" content="${preheader}">` : ''}
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background-color: #f9fafb;
    }

    .email-wrapper {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    .email-container {
      background-color: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }

    .email-header {
      background-color: #ffffff;
      padding: 32px 32px 24px;
      text-align: center;
      border-bottom: 1px solid #e5e7eb;
    }

    .email-logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
    }

    .email-logo-image {
      max-width: 160px;
      height: auto;
      display: block;
    }

    .email-content {
      padding: 40px 32px;
    }

    .email-footer {
      background-color: #f9fafb;
      padding: 32px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }

    .email-footer-text {
      color: #6b7280;
      font-size: 14px;
      margin-bottom: 16px;
    }

    .email-footer-links {
      margin-top: 16px;
    }

    .email-footer-link {
      color: #8B5CF6;
      text-decoration: none;
      font-size: 14px;
      margin: 0 12px;
    }

    .email-footer-link:hover {
      text-decoration: underline;
    }

    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 16px;
      line-height: 1.3;
    }

    p {
      font-size: 16px;
      color: #4b5563;
      margin-bottom: 16px;
      line-height: 1.6;
    }

    .button {
      display: inline-block;
      background-color: #111827;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      margin: 24px 0;
      transition: all 0.2s;
    }

    .button:hover {
      background-color: #1f2937;
      transform: translateY(-1px);
    }

    .code-box {
      background-color: #f9fafb;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      padding: 24px;
      text-align: center;
      margin: 24px 0;
    }

    .code {
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 12px;
      color: #111827;
      font-family: 'Courier New', monospace;
    }

    .divider {
      height: 1px;
      background-color: #e5e7eb;
      margin: 32px 0;
    }

    .info-box {
      background-color: #eff6ff;
      border-left: 4px solid #3b82f6;
      padding: 16px;
      border-radius: 4px;
      margin: 24px 0;
    }

    .info-box p {
      color: #1e40af;
      margin-bottom: 0;
      font-size: 14px;
    }

    @media only screen and (max-width: 600px) {
      .email-wrapper {
        padding: 20px 10px;
      }

      .email-header {
        padding: 32px 24px;
      }

      .email-content {
        padding: 32px 24px;
      }

      .email-footer {
        padding: 24px;
      }

      h1 {
        font-size: 24px;
      }

      .code {
        font-size: 28px;
        letter-spacing: 6px;
      }
    }
  </style>
</head>
<body>
  ${preheader ? `
  <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader}
  </div>
  ` : ''}

  <div class="email-wrapper">
    <div class="email-container">
      <div class="email-header">
        <a href="${baseUrl}" class="email-logo" target="_blank" rel="noopener noreferrer">
          ${logoHtml}
        </a>
      </div>

      <div class="email-content">
        ${content}
      </div>

      <div class="email-footer">
        <p class="email-footer-text">
          Esta é uma mensagem automática, por favor não responda este e-mail.
        </p>
        <p class="email-footer-text">
          © ${new Date().getFullYear()} Quayer. Todos os direitos reservados.
        </p>
        <p class="email-footer-text" style="font-size: 12px; margin-top: 12px;">
          Rua Heitor Penteado, 420 - Vila Madalena<br />
          CEP 05536-000 - São Paulo - SP, Brasil
        </p>
        <div class="email-footer-links">
          <a href="${baseUrl}" class="email-footer-link">Site</a>
          <a href="${baseUrl}/help" class="email-footer-link">Ajuda</a>
          <a href="${baseUrl}/privacy" class="email-footer-link">Privacidade</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}
