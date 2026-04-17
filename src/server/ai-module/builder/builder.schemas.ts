/**
 * Builder Module — Zod Schemas
 *
 * Input/output validation for Builder endpoints that wrap ai-agents infra.
 */

import { z } from 'zod'

// ==========================================
// LIST PROJECTS (query params)
// ==========================================
export const listProjectsQuerySchema = z.object({
  type: z.literal('ai_agent').optional(),
  status: z.enum(['draft', 'production', 'archived']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>

// ==========================================
// US-005: createProject
// ==========================================
export const createProjectInputSchema = z.object({
  prompt: z.string().min(3).max(2000),
  type: z.literal('ai_agent'),
})

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>

export const createProjectOutputSchema = z.object({
  projectId: z.string().uuid(),
  conversationId: z.string().uuid(),
})

export type CreateProjectOutput = z.infer<typeof createProjectOutputSchema>

// ==========================================
// US-007: publishProject
// ==========================================
export const publishProjectInputSchema = z.object({
  projectId: z.string().uuid(),
  promptVersionId: z.string().uuid(),
})

export type PublishProjectInput = z.infer<typeof publishProjectInputSchema>

export const publishProjectOutputSchema = z.object({
  version: z.number().int().positive(),
  publishedAt: z.date(),
})

export type PublishProjectOutput = z.infer<typeof publishProjectOutputSchema>

// ==========================================
// US-006: sendChatMessage
// ==========================================
export const sendChatMessageInputSchema = z.object({
  content: z.string().min(1).max(10000),
})

export type SendChatMessageInput = z.infer<typeof sendChatMessageInputSchema>

// ==========================================
// UPDATE PROMPT (PATCH /projects/:id/prompt)
// ==========================================
export const updatePromptBodySchema = z.object({
  systemPrompt: z
    .string()
    .max(20000, 'System prompt excede 20.000 caracteres'),
})

export type UpdatePromptBody = z.infer<typeof updatePromptBodySchema>

export const updatePromptParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})

export type UpdatePromptParams = z.infer<typeof updatePromptParamsSchema>

// ==========================================
// PLAYGROUND STREAM (POST /projects/:id/playground/stream)
// ==========================================
export const playgroundStreamBodySchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .max(50)
    .optional()
    .default([]),
})

export type PlaygroundStreamBody = z.infer<typeof playgroundStreamBodySchema>

// ==========================================
// LIST VERSIONS (GET /projects/:id/versions)
// ==========================================
export const versionListParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})

export type VersionListParams = z.infer<typeof versionListParamsSchema>
