/**
 * AI Agents Schemas
 *
 * Zod schemas for Agent Studio validation — agents, prompt versions,
 * tools, and deployments.
 */

import { z } from 'zod'

// ── Enums ────────────────────────────────────────────────────────────────────

export const agentToolTypeEnum = z.enum(['BUILTIN', 'CUSTOM', 'MCP'])
export const agentDeployModeEnum = z.enum(['CHAT', 'N8N', 'CLAUDE_CODE'])
export const agentDeployStatusEnum = z.enum(['ACTIVE', 'PAUSED', 'DRAFT'])
export const promptVersionStatusEnum = z.enum(['ACTIVE', 'TESTING', 'ARCHIVED'])

export type AgentToolType = z.infer<typeof agentToolTypeEnum>
export type AgentDeployMode = z.infer<typeof agentDeployModeEnum>
export type AgentDeployStatus = z.infer<typeof agentDeployStatusEnum>
export type PromptVersionStatus = z.infer<typeof promptVersionStatusEnum>

// ── Built-in Tools Registry ───────────────────────────────────────────────────

export const BUILTIN_TOOLS = [
  {
    name: 'transfer_to_human',
    description:
      'Transfere a conversa para um atendente humano. Verifica horário comercial e envia mensagem apropriada.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Motivo da transferência' },
        urgency: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Nível de urgência',
        },
      },
      required: ['reason'],
    },
  },
  {
    name: 'get_session_history',
    description: 'Recupera o histórico de mensagens da sessão atual',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          description: 'Número de mensagens',
        },
      },
    },
  },
  {
    name: 'search_contacts',
    description: 'Busca contatos no CRM pelo nome ou telefone',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nome ou telefone para buscar' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_lead',
    description:
      'Cria um novo lead no CRM com os dados coletados na conversa',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título do lead' },
        notes: { type: 'string', description: 'Observações' },
        assignedAgentId: { type: 'string', description: 'ID do responsável (opcional)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'schedule_callback',
    description:
      'Agenda um retorno de contato para uma data e hora específicas',
    parameters: {
      type: 'object',
      properties: {
        dateTime: {
          type: 'string',
          description: 'Data e hora do retorno (ISO 8601)',
        },
        reason: { type: 'string', description: 'Motivo do agendamento' },
      },
      required: ['dateTime', 'reason'],
    },
  },
  {
    name: 'create_followup',
    description: 'Agenda follow-up proativo com o lead via BullMQ delayed job',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Mensagem ou prompt para o follow-up' },
        delayMinutes: {
          type: 'number',
          minimum: 1,
          maximum: 10080,
          description: 'Delay em minutos (max 7 dias)',
        },
        reason: { type: 'string', description: 'Motivo do follow-up' },
        triggerOnInactivity: {
          type: 'boolean',
          description: 'Disparar somente se inativo',
        },
      },
      required: ['message', 'delayMinutes'],
    },
  },
  {
    name: 'notify_team',
    description:
      'Notifica equipe sobre lead qualificado ou situação importante, sem pausar IA',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Mensagem da notificação' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Prioridade da notificação',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'detect_talking_to_ai',
    description:
      'Detecta se contato percebeu que está falando com IA ou se é bot/spam',
    parameters: {
      type: 'object',
      properties: {
        triggerCase: {
          type: 'string',
          enum: ['human_detected_ai', 'bot_detected'],
          description: 'Caso detectado',
        },
        evidence: { type: 'string', description: 'Evidência do contato ou padrão' },
        pauseHours: {
          type: 'number',
          minimum: 1,
          maximum: 48,
          description: 'Horas para bloquear IA',
        },
      },
      required: ['triggerCase', 'evidence'],
    },
  },
] as const

export type BuiltinToolName = (typeof BUILTIN_TOOLS)[number]['name']

// ── AI Agent Config ───────────────────────────────────────────────────────────

export const createAgentSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100, 'Nome muito longo'),
  systemPrompt: z
    .string()
    .min(10, 'System prompt deve ter pelo menos 10 caracteres')
    .max(50000, 'System prompt muito longo'),
  provider: z
    .enum(['openai', 'anthropic', 'openrouter'])
    .default('openai'),
  model: z.string().default('gpt-4o'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(100).max(128000).default(4096),
  personality: z.string().max(500).optional(),
  agentTarget: z.string().max(100).optional(),
  agentBehavior: z.string().max(1000).optional(),
  agentAvatar: z.string().url('URL do avatar inválida').optional(),
  useMemory: z.boolean().default(true),
  memoryWindow: z.number().min(1).max(50).default(10),
  enabledTools: z
    .array(z.string())
    .default(['transfer_to_human']),
  transferMessages: z
    .object({
      withinHours: z.string().optional(),
      outsideHours: z.string().optional(),
    })
    .optional(),
  maxTokensPerSession: z.number().min(5000).max(500000).default(50000),
  debounceMs: z
    .object({
      whatsapp: z.number().min(1000).max(30000).default(5000),
      instagram: z.number().min(1000).max(30000).default(7000),
      chatwoot: z.number().min(1000).max(30000).default(3000),
    })
    .optional(),
  fallbackModel: z.string().max(100).optional(),
})

export const updateAgentSchema = createAgentSchema.partial()

// Agent response (safe to send to client)
export const agentResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  systemPrompt: z.string(),
  provider: z.string(),
  model: z.string(),
  temperature: z.number(),
  maxTokens: z.number(),
  personality: z.string().nullable(),
  agentTarget: z.string().nullable(),
  agentBehavior: z.string().nullable(),
  agentAvatar: z.string().nullable(),
  useMemory: z.boolean(),
  memoryWindow: z.number(),
  enabledTools: z.array(z.string()),
  maxTokensPerSession: z.number(),
  debounceMs: z.record(z.string(), z.number()).nullable(),
  fallbackModel: z.string().nullable(),
  isActive: z.boolean(),
  organizationId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type CreateAgentInput = z.infer<typeof createAgentSchema>
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>
export type AgentResponse = z.infer<typeof agentResponseSchema>

// ── Prompt Versions ───────────────────────────────────────────────────────────

export const createPromptVersionSchema = z.object({
  systemPrompt: z
    .string()
    .min(10, 'System prompt deve ter pelo menos 10 caracteres')
    .max(50000, 'System prompt muito longo'),
  changelog: z.string().max(500).optional(),
})

export const activatePromptVersionSchema = z.object({
  versionId: z.string().uuid('ID de versão inválido'),
})

// Prompt version response
export const promptVersionResponseSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  systemPrompt: z.string(),
  changelog: z.string().nullable(),
  status: promptVersionStatusEnum,
  version: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type CreatePromptVersionInput = z.infer<typeof createPromptVersionSchema>
export type ActivatePromptVersionInput = z.infer<typeof activatePromptVersionSchema>
export type PromptVersionResponse = z.infer<typeof promptVersionResponseSchema>

// ── Agent Tools ───────────────────────────────────────────────────────────────

export const createAgentToolSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100, 'Nome muito longo'),
  description: z
    .string()
    .min(5, 'Descrição deve ter pelo menos 5 caracteres')
    .max(500, 'Descrição muito longa'),
  type: agentToolTypeEnum.default('CUSTOM'),
  parameters: z.record(z.any()).optional(), // JSON Schema definition
  webhookUrl: z.string().url('URL do webhook inválida').optional(),
  webhookSecret: z.string().max(256).optional(),
  webhookTimeout: z.number().min(1000).max(30000).default(10000),
})

export const updateAgentToolSchema = createAgentToolSchema.partial()

// Agent tool response
export const agentToolResponseSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  type: agentToolTypeEnum,
  parameters: z.record(z.any()).nullable(),
  webhookUrl: z.string().nullable(),
  webhookTimeout: z.number(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type CreateAgentToolInput = z.infer<typeof createAgentToolSchema>
export type UpdateAgentToolInput = z.infer<typeof updateAgentToolSchema>
export type AgentToolResponse = z.infer<typeof agentToolResponseSchema>

// ── Agent Deployment ──────────────────────────────────────────────────────────

export const createDeploymentSchema = z.object({
  connectionId: z.string().uuid('ID de conexão inválido'),
  mode: agentDeployModeEnum,
  config: z.record(z.any()).optional(), // Mode-specific config (n8n webhook, etc.)
})

export const updateDeploymentStatusSchema = z.object({
  status: agentDeployStatusEnum,
})

// Deployment response
export const deploymentResponseSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  connectionId: z.string().uuid(),
  mode: agentDeployModeEnum,
  status: agentDeployStatusEnum,
  config: z.record(z.any()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>
export type UpdateDeploymentStatusInput = z.infer<typeof updateDeploymentStatusSchema>
export type DeploymentResponse = z.infer<typeof deploymentResponseSchema>

// ── Query Params ──────────────────────────────────────────────────────────────

export const listAgentsQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).optional(),
  search: z.string().max(100).optional(),
})

export type ListAgentsQuery = z.infer<typeof listAgentsQuerySchema>
