/**
 * Builder Module — Zod Schemas
 *
 * Input/output validation for Builder endpoints that wrap ai-agents infra.
 */

import { z } from 'zod'

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
