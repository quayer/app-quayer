import { z } from 'zod'

const blueprintIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i)

const blueprintTextSchema = z.string().min(1).max(600)

export const blueprintStageSchema = z
  .object({
    id: blueprintIdSchema,
    title: z.string().min(1).max(120),
    goal: blueprintTextSchema,
    order: z.number().int().nonnegative().optional(),
  })
  .strict()

export const blueprintVariableSchema = z
  .object({
    key: blueprintIdSchema,
    label: z.string().min(1).max(120),
    type: z
      .enum([
        'text',
        'number',
        'boolean',
        'date',
        'time',
        'phone',
        'email',
        'currency',
        'list',
        'location',
      ])
      .default('text'),
    source: z.enum(['source', 'user', 'default']).optional(),
    reviewRequired: z.boolean().default(false),
  })
  .strict()

export const blueprintQuestionSchema = z
  .object({
    id: blueprintIdSchema,
    stageId: blueprintIdSchema.optional(),
    text: z.string().min(1).max(280),
    purpose: z.string().min(1).max(240),
    variableKey: blueprintIdSchema,
    skipWhenKnown: z.string().min(1).max(240),
    required: z.boolean().default(true),
    order: z.number().int().nonnegative().optional(),
  })
  .strict()

export const blueprintSkipRuleSchema = z
  .object({
    questionId: blueprintIdSchema,
    condition: z.string().min(1).max(240),
    reason: z.string().min(1).max(240).optional(),
  })
  .strict()

export const blueprintToolTriggerSchema = z
  .object({
    capability: z.string().min(1).max(160),
    toolKey: z.string().min(1).max(120).optional(),
    when: z.string().min(1).max(300),
    requiredVariables: z.array(blueprintIdSchema).max(20).default([]),
    fallback: z.string().min(1).max(300).optional(),
    active: z.boolean().default(false),
  })
  .strict()

export const blueprintObjectionRuleSchema = z
  .object({
    objection: z.string().min(1).max(160),
    responseGuidance: z.string().min(1).max(400),
  })
  .strict()

export const blueprintSourceRefSchema = z
  .object({
    type: z.enum(['source', 'user', 'default']),
    label: z.string().min(1).max(180),
  })
  .strict()

export const conversationBlueprintSchema = z
  .object({
    status: z
      .enum(['draft', 'proposed', 'approved', 'needs_review'])
      .default('draft'),
    objective: z.string().min(1).max(500).optional(),
    niche: z.string().min(1).max(200).optional(),
    stages: z.array(blueprintStageSchema).max(12).default([]),
    questions: z.array(blueprintQuestionSchema).max(20).default([]),
    variables: z.array(blueprintVariableSchema).max(30).default([]),
    skipRules: z.array(blueprintSkipRuleSchema).max(30).default([]),
    successCriteria: z.array(blueprintTextSchema).max(12).default([]),
    handoffTriggers: z.array(blueprintTextSchema).max(12).default([]),
    toolTriggers: z.array(blueprintToolTriggerSchema).max(20).default([]),
    objectionRules: z.array(blueprintObjectionRuleSchema).max(16).default([]),
    doRules: z.array(blueprintTextSchema).max(20).default([]),
    dontRules: z.array(blueprintTextSchema).max(20).default([]),
    sourceRefs: z.array(blueprintSourceRefSchema).max(20).default([]),
    approvedAt: z.string().datetime().optional(),
  })
  .strict()

export const conversationBlueprintEditableSchema =
  conversationBlueprintSchema.omit({ status: true, approvedAt: true }).extend({
    status: z
      .enum(['draft', 'proposed', 'approved', 'needs_review'])
      .optional(),
  })

export type BlueprintStage = z.infer<typeof blueprintStageSchema>
export type BlueprintQuestion = z.infer<typeof blueprintQuestionSchema>
export type BlueprintVariable = z.infer<typeof blueprintVariableSchema>
export type BlueprintSkipRule = z.infer<typeof blueprintSkipRuleSchema>
export type BlueprintToolTrigger = z.infer<typeof blueprintToolTriggerSchema>
export type BlueprintObjectionRule = z.infer<typeof blueprintObjectionRuleSchema>
export type BlueprintSourceRef = z.infer<typeof blueprintSourceRefSchema>
export type ConversationBlueprint = z.infer<typeof conversationBlueprintSchema>
export type ConversationBlueprintEditable = z.infer<
  typeof conversationBlueprintEditableSchema
>
