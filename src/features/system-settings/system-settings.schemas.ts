import { z } from 'zod'

// Categories
export const settingsCategorySchema = z.enum([
  'uazapi',
  'email',
  'ai',
  'concatenation',
  'oauth',
  'security',
  'system',
])

// UAZapi Settings
export const uazapiSettingsSchema = z.object({
  baseUrl: z.string().url('URL inválida'),
  adminToken: z.string().min(1, 'Token obrigatório'),
  webhookUrl: z.string().url('URL do webhook inválida').optional().or(z.literal('')),
})

// SMTP Config
export const smtpConfigSchema = z.object({
  host: z.string().min(1, 'Host obrigatório'),
  port: z.coerce.number().min(1).max(65535),
  secure: z.boolean().default(false),
  user: z.string().min(1, 'Usuário obrigatório'),
  pass: z.string().min(1, 'Senha obrigatória'),
})

// Email Settings
export const emailSettingsSchema = z.object({
  provider: z.enum(['mock', 'resend', 'smtp']),
  from: z.string().email('Email inválido'),
  resendApiKey: z.string().optional(),
  smtp: smtpConfigSchema.optional(),
})

// AI Settings
export const aiSettingsSchema = z.object({
  openaiApiKey: z.string().optional(),
  defaultModel: z.string().default('gpt-4o-mini'),
  imageDescriptionEnabled: z.boolean().default(true),
  audioTranscriptionEnabled: z.boolean().default(true),
  documentAnalysisEnabled: z.boolean().default(true),
  videoTranscriptionEnabled: z.boolean().default(false),
})

// Concatenation Settings
export const concatenationSettingsSchema = z.object({
  timeout: z.coerce.number().min(1000).max(60000).default(8000),
  maxMessages: z.coerce.number().min(1).max(100).default(10),
  sameTypeOnly: z.boolean().default(false),
  sameSenderOnly: z.boolean().default(true),
})

// OAuth Settings
export const oauthSettingsSchema = z.object({
  googleClientId: z.string().optional(),
  googleClientSecret: z.string().optional(),
  googleRedirectUri: z.string().url().optional().or(z.literal('')),
})

// Security Settings
export const securitySettingsSchema = z.object({
  accessTokenExpiresIn: z.string().regex(/^\d+[smhd]$/, 'Formato inválido (ex: 15m, 1h, 7d)').default('15m'),
  refreshTokenExpiresIn: z.string().regex(/^\d+[smhd]$/, 'Formato inválido').default('7d'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

// Email Template
export const emailTemplateSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  subject: z.string().min(1, 'Assunto obrigatório'),
  htmlContent: z.string().min(1, 'Conteúdo HTML obrigatório'),
  textContent: z.string().optional(),
  variables: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
})

export const updateEmailTemplateSchema = emailTemplateSchema.partial().extend({
  id: z.string().uuid(),
})

// AI Prompt
export const aiPromptSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  description: z.string().optional(),
  prompt: z.string().min(1, 'Prompt obrigatório'),
  model: z.string().optional(),
  isActive: z.boolean().default(true),
})

export const updateAIPromptSchema = aiPromptSchema.partial().extend({
  id: z.string().uuid(),
})

// Generic setting update
export const updateSettingSchema = z.object({
  category: settingsCategorySchema,
  key: z.string().min(1),
  value: z.string(),
  encrypted: z.boolean().default(false),
  description: z.string().optional(),
})

// Bulk settings update
export const bulkUpdateSettingsSchema = z.object({
  category: settingsCategorySchema,
  settings: z.record(z.string(), z.any()),
})

// Global Webhook Settings (UAZapi)
export const globalWebhookSettingsSchema = z.object({
  url: z.string().url('URL do webhook inválida'),
  events: z.array(z.string()).min(1, 'Selecione pelo menos um evento'),
  excludeMessages: z.array(z.string()).default([]),
  addUrlEvents: z.boolean().default(false),
  addUrlTypesMessages: z.boolean().default(false),
})

// Test connection schemas
export const testUazapiConnectionSchema = z.object({
  baseUrl: z.string().url(),
  adminToken: z.string().min(1),
})

export const testSmtpConnectionSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number(),
  secure: z.boolean(),
  user: z.string().min(1),
  pass: z.string().min(1),
})

export const testOpenAIConnectionSchema = z.object({
  apiKey: z.string().min(1),
})

// Types
export type UAZapiSettingsInput = z.infer<typeof uazapiSettingsSchema>
export type EmailSettingsInput = z.infer<typeof emailSettingsSchema>
export type AISettingsInput = z.infer<typeof aiSettingsSchema>
export type ConcatenationSettingsInput = z.infer<typeof concatenationSettingsSchema>
export type OAuthSettingsInput = z.infer<typeof oauthSettingsSchema>
export type SecuritySettingsInput = z.infer<typeof securitySettingsSchema>
export type EmailTemplateInput = z.infer<typeof emailTemplateSchema>
export type AIPromptInput = z.infer<typeof aiPromptSchema>
export type GlobalWebhookSettingsInput = z.infer<typeof globalWebhookSettingsSchema>
