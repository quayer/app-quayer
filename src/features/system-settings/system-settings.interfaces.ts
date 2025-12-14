// System Settings Interfaces

export type SettingsCategory =
  | 'uazapi'
  | 'email'
  | 'ai'
  | 'concatenation'
  | 'oauth'
  | 'security'
  | 'system'

export interface SystemSetting {
  id: string
  category: SettingsCategory
  key: string
  value: string
  encrypted: boolean
  description?: string | null
  createdAt: Date
  updatedAt: Date
  updatedBy?: string | null
}

// UAZapi Settings
export interface UAZapiSettings {
  baseUrl: string
  adminToken: string
  webhookUrl: string
}

// Email Settings
export interface EmailSettings {
  provider: 'mock' | 'resend' | 'smtp'
  from: string
  resendApiKey?: string
  smtp?: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
  }
}

// AI Settings
export interface AISettings {
  openaiApiKey: string
  defaultModel: string
  imageDescriptionEnabled: boolean
  audioTranscriptionEnabled: boolean
  documentAnalysisEnabled: boolean
  videoTranscriptionEnabled: boolean
}

// Concatenation Settings
export interface ConcatenationSettings {
  timeout: number // milliseconds
  maxMessages: number
  sameTypeOnly: boolean
  sameSenderOnly: boolean
}

// OAuth Settings
export interface OAuthSettings {
  googleClientId?: string
  googleClientSecret?: string
  googleRedirectUri?: string
}

// Security Settings
export interface SecuritySettings {
  accessTokenExpiresIn: string
  refreshTokenExpiresIn: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

// Email Template
export interface EmailTemplate {
  id: string
  name: string
  subject: string
  htmlContent: string
  textContent?: string | null
  variables: string[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  updatedBy?: string | null
}

// AI Prompt
export interface AIPromptConfig {
  id: string
  name: string
  description?: string | null
  prompt: string
  model?: string | null
  isActive: boolean
  usageCount: number
  createdAt: Date
  updatedAt: Date
  updatedBy?: string | null
}

// Default values
export const DEFAULT_SETTINGS = {
  uazapi: {
    baseUrl: 'https://api.uazapi.app',
    adminToken: '',
    webhookUrl: '',
  } as UAZapiSettings,

  email: {
    provider: 'mock' as const,
    from: 'noreply@quayer.com',
  } as EmailSettings,

  ai: {
    openaiApiKey: '',
    defaultModel: 'gpt-4o-mini',
    imageDescriptionEnabled: true,
    audioTranscriptionEnabled: true,
    documentAnalysisEnabled: true,
    videoTranscriptionEnabled: false,
  } as AISettings,

  concatenation: {
    timeout: 8000,
    maxMessages: 10,
    sameTypeOnly: false,
    sameSenderOnly: true,
  } as ConcatenationSettings,

  oauth: {} as OAuthSettings,

  security: {
    accessTokenExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
    logLevel: 'info' as const,
  } as SecuritySettings,
}

// Default Email Templates
export const DEFAULT_EMAIL_TEMPLATES = [
  {
    name: 'welcome',
    subject: 'Bem-vindo ao Quayer!',
    htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #333;">Bem-vindo ao Quayer, {{name}}!</h1>
  <p>Sua conta foi criada com sucesso.</p>
  <p>Acesse a plataforma para começar:</p>
  <a href="{{appUrl}}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Acessar Quayer</a>
  <p style="color: #666; margin-top: 20px;">Se você não criou esta conta, ignore este email.</p>
</body>
</html>`,
    textContent: 'Bem-vindo ao Quayer, {{name}}! Acesse: {{appUrl}}',
    variables: ['name', 'appUrl'],
  },
  {
    name: 'verification',
    subject: 'Verifique seu email - Quayer',
    htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #333;">Verificação de Email</h1>
  <p>Olá {{name}},</p>
  <p>Use o código abaixo para verificar seu email:</p>
  <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">{{code}}</span>
  </div>
  <p>Este código expira em {{expirationMinutes}} minutos.</p>
  <p style="color: #666;">Se você não solicitou este código, ignore este email.</p>
</body>
</html>`,
    textContent: 'Seu código de verificação: {{code}}',
    variables: ['name', 'code', 'expirationMinutes'],
  },
  {
    name: 'login_code',
    subject: 'Código {{code}} - Login Quayer',
    htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #333;">Código de Login</h1>
  <p>Olá {{name}},</p>
  <p>Use o código abaixo para fazer login:</p>
  <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">{{code}}</span>
  </div>
  <p>Ou clique no link abaixo para login automático:</p>
  <a href="{{magicLink}}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Entrar no Quayer</a>
  <p style="margin-top: 20px;">Este código expira em {{expirationMinutes}} minutos.</p>
  <p style="color: #666;">Se você não solicitou este código, ignore este email.</p>
</body>
</html>`,
    textContent: 'Seu código de login: {{code}}. Ou acesse: {{magicLink}}',
    variables: ['name', 'code', 'magicLink', 'expirationMinutes'],
  },
  {
    name: 'welcome_signup',
    subject: 'Código {{code}} - Bem-vindo ao Quayer!',
    htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #333;">Bem-vindo ao Quayer, {{name}}!</h1>
  <p>Estamos muito felizes em ter você conosco.</p>
  <p>Use o código abaixo para confirmar seu cadastro:</p>
  <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">{{code}}</span>
  </div>
  <p>Ou clique no link abaixo para ativar sua conta automaticamente:</p>
  <a href="{{magicLink}}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Ativar Minha Conta</a>
  <p style="margin-top: 20px;">Este código expira em {{expirationMinutes}} minutos.</p>
  <p style="color: #666;">Se você não criou esta conta, ignore este email.</p>
</body>
</html>`,
    textContent: 'Bem-vindo ao Quayer, {{name}}! Seu código: {{code}}. Ou acesse: {{magicLink}}',
    variables: ['name', 'code', 'magicLink', 'expirationMinutes'],
  },
  {
    name: 'invitation',
    subject: 'Convite para {{organizationName}} - Quayer',
    htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #333;">Você foi convidado!</h1>
  <p>Olá,</p>
  <p>{{inviterName}} convidou você para fazer parte da organização <strong>{{organizationName}}</strong> no Quayer como <strong>{{role}}</strong>.</p>
  <a href="{{invitationUrl}}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Aceitar Convite</a>
  <p style="margin-top: 20px;">Este convite expira em 7 dias.</p>
</body>
</html>`,
    textContent: '{{inviterName}} convidou você para {{organizationName}}. Acesse: {{invitationUrl}}',
    variables: ['inviterName', 'organizationName', 'invitationUrl', 'role'],
  },
  {
    name: 'password_reset',
    subject: 'Redefinição de Senha - Quayer',
    htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #333;">Redefinição de Senha</h1>
  <p>Olá {{name}},</p>
  <p>Você solicitou a redefinição da sua senha. Clique no botão abaixo para criar uma nova senha:</p>
  <a href="{{resetUrl}}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">Redefinir Senha</a>
  <p>Se você não solicitou a redefinição de senha, ignore este email.</p>
  <p style="color: #666;">Este link expira em {{expirationMinutes}} minutos.</p>
</body>
</html>`,
    textContent: 'Olá {{name}}, clique aqui para redefinir sua senha: {{resetUrl}}. Este link expira em {{expirationMinutes}} minutos.',
    variables: ['name', 'resetUrl', 'expirationMinutes'],
  },
]

// Default AI Prompts
export const DEFAULT_AI_PROMPTS = [
  {
    name: 'image_description',
    description: 'Prompt para descrever imagens recebidas via WhatsApp',
    prompt: `Analise esta imagem e forneça uma descrição detalhada em português brasileiro.

Inclua:
- O que aparece na imagem (pessoas, objetos, cenário)
- Cores predominantes
- Contexto provável (se identificável)
- Texto visível (se houver)

Seja conciso mas informativo. Máximo 3 parágrafos.`,
    model: 'gpt-4o',
  },
  {
    name: 'audio_transcription',
    description: 'Configuração para transcrição de áudio via Whisper',
    prompt: `Transcreva o áudio em português brasileiro.
Mantenha pontuação adequada e parágrafos quando necessário.
Se houver múltiplos falantes, identifique-os como "Falante 1:", "Falante 2:", etc.`,
    model: 'whisper-1',
  },
  {
    name: 'document_analysis',
    description: 'Prompt para analisar documentos/PDFs recebidos',
    prompt: `Analise este documento e extraia as informações principais:

1. Tipo de documento
2. Informações-chave (datas, valores, nomes)
3. Resumo do conteúdo
4. Ações necessárias (se aplicável)

Responda em português brasileiro de forma estruturada.`,
    model: 'gpt-4o',
  },
  {
    name: 'video_transcription',
    description: 'Prompt para transcrever audio extraido de videos',
    prompt: `Transcreva o audio deste video em portugues brasileiro.
Mantenha pontuacao adequada e paragrafos quando necessario.
Se houver multiplos falantes, identifique-os como "Falante 1:", "Falante 2:", etc.
Se houver musica de fundo ou efeitos sonoros relevantes, mencione entre colchetes [musica de fundo].`,
    model: 'whisper-1',
  },
  {
    name: 'message_summary',
    description: 'Prompt para resumir conversas longas',
    prompt: `Resuma esta conversa de forma concisa:

- Principais topicos discutidos
- Decisoes tomadas
- Pendencias ou proximos passos
- Tom geral da conversa (satisfeito, frustrado, neutro)

Maximo 5 bullet points em portugues brasileiro.`,
    model: 'gpt-4o-mini',
  },
]
