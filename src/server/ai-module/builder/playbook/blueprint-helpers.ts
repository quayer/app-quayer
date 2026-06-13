import {
  conversationBlueprintSchema,
  type BlueprintQuestion,
  type BlueprintStage,
  type BlueprintToolTrigger,
  type BlueprintVariable,
  type ConversationBlueprint,
} from './blueprint.schema'

export type BlueprintValidationSeverity = 'warning' | 'fail'

export interface BlueprintValidationIssue {
  code:
    | 'missing_stage'
    | 'missing_question'
    | 'missing_success_criteria'
    | 'question_without_variable'
    | 'question_without_skip_rule'
    | 'multi_question'
    | 'tool_trigger_without_data'
  severity: BlueprintValidationSeverity
  message: string
}

const DEFAULT_STAGE_ID = 'qualificacao'

function compactText(value: string | undefined, max = 600): string | undefined {
  const trimmed = value?.trim().replace(/\s+/g, ' ')
  return trimmed && trimmed.length > 0 ? trimmed.slice(0, max) : undefined
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  return slug || fallback
}

function uniqueBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const key = keyOf(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function normalizeStage(stage: BlueprintStage, index: number): BlueprintStage {
  const title = compactText(stage.title, 120) ?? `Etapa ${index + 1}`
  return {
    id: slugify(stage.id || title, `etapa_${index + 1}`),
    title,
    goal:
      compactText(stage.goal, 600) ??
      'Conduzir esta parte da conversa com clareza.',
    order: stage.order ?? index,
  }
}

function normalizeVariable(
  variable: BlueprintVariable,
  fallbackKey: string,
): BlueprintVariable {
  const label = compactText(variable.label, 120) ?? fallbackKey
  return {
    key: slugify(variable.key || fallbackKey, fallbackKey),
    label,
    type: variable.type ?? 'text',
    source: variable.source,
    reviewRequired: variable.reviewRequired ?? false,
  }
}

function normalizeQuestion(
  question: BlueprintQuestion,
  index: number,
  fallbackStageId: string,
): BlueprintQuestion {
  const text =
    compactText(question.text, 280) ?? 'Qual informação você quer compartilhar?'
  const variableKey = slugify(
    question.variableKey || question.purpose || text,
    `resposta_${index + 1}`,
  )
  return {
    id: slugify(question.id || text, `pergunta_${index + 1}`),
    stageId: question.stageId
      ? slugify(question.stageId, fallbackStageId)
      : fallbackStageId,
    text,
    purpose:
      compactText(question.purpose, 240) ??
      'Entender melhor a necessidade do lead.',
    variableKey,
    skipWhenKnown:
      compactText(question.skipWhenKnown, 240) ??
      `Pular se ${variableKey} já estiver claro no contexto.`,
    required: question.required ?? true,
    order: question.order ?? index,
  }
}

function normalizeToolTrigger(
  trigger: BlueprintToolTrigger,
): BlueprintToolTrigger {
  return {
    capability: compactText(trigger.capability, 160) ?? 'Capacidade externa',
    toolKey: compactText(trigger.toolKey, 120),
    when:
      compactText(trigger.when, 300) ??
      'Usar apenas quando os dados obrigatórios estiverem claros.',
    requiredVariables: uniqueBy(trigger.requiredVariables, (v) => v).map((v) =>
      slugify(v, v),
    ),
    fallback: compactText(trigger.fallback, 300),
    active: trigger.active ?? false,
  }
}

function ensureVariablesForQuestions(
  variables: readonly BlueprintVariable[],
  questions: readonly BlueprintQuestion[],
): BlueprintVariable[] {
  const byKey = new Map(variables.map((v) => [v.key, v]))
  for (const question of questions) {
    if (byKey.has(question.variableKey)) continue
    byKey.set(question.variableKey, {
      key: question.variableKey,
      label: question.purpose,
      type: 'text',
      source: 'default',
      reviewRequired: true,
    })
  }
  return Array.from(byKey.values())
}

export function normalizeConversationBlueprint(
  raw: unknown,
): ConversationBlueprint {
  const parsed = conversationBlueprintSchema.safeParse(raw)
  const base = parsed.success ? parsed.data : conversationBlueprintSchema.parse({})

  const stagesInput =
    base.stages.length > 0
      ? base.stages
      : [
          {
            id: DEFAULT_STAGE_ID,
            title: 'Qualificar interesse',
            goal: 'Entender a necessidade do lead e conduzir para o próximo passo.',
            order: 0,
          },
        ]
  const stages = uniqueBy(
    stagesInput.map(normalizeStage),
    (stage) => stage.id,
  )
  const fallbackStageId = stages[0]?.id ?? DEFAULT_STAGE_ID

  const questions = uniqueBy(
    base.questions.map((q, index) =>
      normalizeQuestion(q, index, fallbackStageId),
    ),
    (question) => question.id,
  )

  const variables = ensureVariablesForQuestions(
    uniqueBy(
      base.variables.map((v) => normalizeVariable(v, v.key)),
      (variable) => variable.key,
    ),
    questions,
  )

  return conversationBlueprintSchema.parse({
    ...base,
    objective: compactText(base.objective, 500),
    niche: compactText(base.niche, 200),
    stages,
    questions,
    variables,
    skipRules: uniqueBy(base.skipRules, (rule) => rule.questionId).map((rule) => ({
      questionId: slugify(rule.questionId, 'pergunta'),
      condition: compactText(rule.condition, 240) ?? 'Informação já conhecida.',
      reason: compactText(rule.reason, 240),
    })),
    successCriteria: uniqueBy(
      base.successCriteria
        .map((value) => compactText(value, 600))
        .filter((value): value is string => value !== undefined),
      (value) => value.toLowerCase(),
    ),
    handoffTriggers: uniqueBy(
      base.handoffTriggers
        .map((value) => compactText(value, 600))
        .filter((value): value is string => value !== undefined),
      (value) => value.toLowerCase(),
    ),
    toolTriggers: base.toolTriggers.map(normalizeToolTrigger),
    objectionRules: uniqueBy(
      base.objectionRules.map((rule) => ({
        objection: compactText(rule.objection, 160) ?? 'Objeção',
        responseGuidance:
          compactText(rule.responseGuidance, 400) ??
          'Responder com clareza e voltar ao próximo passo.',
      })),
      (rule) => rule.objection.toLowerCase(),
    ),
    doRules: uniqueBy(
      base.doRules
        .map((value) => compactText(value, 600))
        .filter((value): value is string => value !== undefined),
      (value) => value.toLowerCase(),
    ),
    dontRules: uniqueBy(
      base.dontRules
        .map((value) => compactText(value, 600))
        .filter((value): value is string => value !== undefined),
      (value) => value.toLowerCase(),
    ),
    sourceRefs: uniqueBy(
      base.sourceRefs.map((ref) => ({
        type: ref.type,
        label: compactText(ref.label, 180) ?? ref.type,
      })),
      (ref) => `${ref.type}:${ref.label.toLowerCase()}`,
    ),
  })
}

export function validateConversationBlueprint(
  blueprint: ConversationBlueprint,
): BlueprintValidationIssue[] {
  const issues: BlueprintValidationIssue[] = []
  if (blueprint.stages.length === 0) {
    issues.push({
      code: 'missing_stage',
      severity: 'fail',
      message: 'O plano de atendimento precisa ter ao menos uma etapa.',
    })
  }
  if (blueprint.questions.length === 0) {
    issues.push({
      code: 'missing_question',
      severity: 'fail',
      message: 'O plano de atendimento precisa ter ao menos uma pergunta.',
    })
  }
  if (blueprint.successCriteria.length === 0) {
    issues.push({
      code: 'missing_success_criteria',
      severity: 'warning',
      message: 'Defina ao menos um critério de sucesso da conversa.',
    })
  }

  const variableKeys = new Set(blueprint.variables.map((v) => v.key))
  for (const question of blueprint.questions) {
    if (!variableKeys.has(question.variableKey)) {
      issues.push({
        code: 'question_without_variable',
        severity: 'fail',
        message: `A pergunta "${question.text}" captura uma variável inexistente (${question.variableKey}).`,
      })
    }
    if (!question.skipWhenKnown.trim()) {
      issues.push({
        code: 'question_without_skip_rule',
        severity: 'fail',
        message: `A pergunta "${question.text}" precisa dizer quando deve ser pulada.`,
      })
    }
    const questionMarks = (question.text.match(/\?/g) ?? []).length
    if (questionMarks > 1 || /\s(e|ou)\s.+\?/i.test(question.text)) {
      issues.push({
        code: 'multi_question',
        severity: 'warning',
        message: `A pergunta "${question.text}" pode estar perguntando mais de uma coisa ao mesmo tempo.`,
      })
    }
  }

  for (const trigger of blueprint.toolTriggers) {
    if (trigger.active && trigger.requiredVariables.length === 0) {
      issues.push({
        code: 'tool_trigger_without_data',
        severity: 'warning',
        message: `A capacidade "${trigger.capability}" deve declarar quais dados precisa antes de usar a ferramenta.`,
      })
    }
  }

  return issues
}

export function blueprintHasBlockingIssues(
  issues: readonly BlueprintValidationIssue[],
): boolean {
  return issues.some((issue) => issue.severity === 'fail')
}
