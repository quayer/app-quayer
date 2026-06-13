import type {
  BlueprintQuestion,
  BlueprintToolTrigger,
  ConversationBlueprint,
} from '../playbook/blueprint.schema'

export type BlueprintPreservationSeverity = 'error' | 'warning'

export type BlueprintPreservationIssueCode =
  | 'missing_question'
  | 'missing_variable'
  | 'missing_skip_rule'
  | 'missing_handoff_trigger'
  | 'missing_tool_trigger'
  | 'missing_tool_required_variable'
  | 'missing_tool_fallback'
  | 'missing_dont_rule'

export interface BlueprintPreservationIssue {
  validator: 'blueprint_preservation'
  code: BlueprintPreservationIssueCode
  severity: BlueprintPreservationSeverity
  message: string
  path: string
  expected: string
}

export interface BlueprintPreservationResult {
  pass: boolean
  issues: BlueprintPreservationIssue[]
}

export interface ValidateBlueprintPreservationInput {
  prompt: string
  blueprint: ConversationBlueprint
}

interface TextIndex {
  normalized: string
  tokens: Set<string>
}

const MIN_TOKEN_LENGTH = 4

const STOP_WORDS = new Set([
  'ainda',
  'algo',
  'antes',
  'aos',
  'apos',
  'aquela',
  'aquele',
  'aqui',
  'caso',
  'cliente',
  'clientes',
  'com',
  'como',
  'contexto',
  'da',
  'das',
  'dados',
  'de',
  'deve',
  'devem',
  'disponivel',
  'disponiveis',
  'do',
  'dos',
  'essa',
  'esse',
  'esta',
  'este',
  'estiver',
  'for',
  'houver',
  'informacao',
  'informacoes',
  'isso',
  'ja',
  'lead',
  'mais',
  'nao',
  'nas',
  'nos',
  'para',
  'pela',
  'pelo',
  'pergunta',
  'perguntar',
  'pergunte',
  'pois',
  'por',
  'porque',
  'quando',
  'que',
  'qual',
  'se',
  'sem',
  'ser',
  'sobre',
  'tem',
  'tiver',
  'uma',
  'voce',
])

const SEMANTIC_TERMS: Record<string, string[]> = {
  agendar: ['agenda', 'agendamento', 'agende', 'marcar', 'marque', 'horario'],
  agendamento: ['agenda', 'agendar', 'marcar', 'horario'],
  bairro: ['regiao', 'localizacao', 'local'],
  celular: ['telefone', 'whatsapp', 'contato'],
  contato: ['telefone', 'celular', 'whatsapp', 'email'],
  email: ['e-mail', 'contato'],
  endereco: ['localizacao', 'local', 'regiao'],
  humano: ['atendente', 'equipe', 'pessoa', 'transferir', 'handoff'],
  imovel: ['apartamento', 'casa', 'unidade', 'tipologia'],
  nome: ['identificacao', 'chamar'],
  orcamento: ['preco', 'valor', 'investimento', 'faixa'],
  preco: ['valor', 'orcamento', 'investimento', 'faixa'],
  regiao: ['bairro', 'localizacao', 'local'],
  telefone: ['celular', 'whatsapp', 'contato'],
  transferir: ['humano', 'atendente', 'equipe', 'handoff'],
  valor: ['preco', 'orcamento', 'investimento', 'faixa'],
  whatsapp: ['telefone', 'celular', 'contato'],
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter(
      (token) =>
        token.length >= MIN_TOKEN_LENGTH &&
        !STOP_WORDS.has(token) &&
        !/^\d+$/.test(token),
    )
}

function buildTextIndex(prompt: string): TextIndex {
  const normalized = normalizeText(prompt)
  const tokens = new Set(tokenize(prompt))

  return { normalized, tokens }
}

function uniqueTokens(...values: string[]): string[] {
  return Array.from(new Set(values.flatMap(tokenize)))
}

function expandTokens(tokens: readonly string[]): string[] {
  return Array.from(
    new Set(tokens.flatMap((token) => [token, ...(SEMANTIC_TERMS[token] ?? [])])),
  )
}

function hasAnyToken(index: TextIndex, tokens: readonly string[]): boolean {
  return expandTokens(tokens).some((token) => index.tokens.has(token))
}

function tokenCoverage(index: TextIndex, tokens: readonly string[]): number {
  const expanded = expandTokens(tokens)
  if (expanded.length === 0) return 1

  const matched = tokens.filter((token) =>
    [token, ...(SEMANTIC_TERMS[token] ?? [])].some((term) =>
      index.tokens.has(term),
    ),
  ).length

  return matched / tokens.length
}

function hasPhraseOrCoverage(
  index: TextIndex,
  value: string,
  minimumCoverage = 0.55,
): boolean {
  const normalized = normalizeText(value)
  if (normalized && index.normalized.includes(normalized)) return true

  const tokens = uniqueTokens(value)
  if (tokens.length === 0) return false
  if (tokens.length === 1) return hasAnyToken(index, tokens)

  return tokenCoverage(index, tokens) >= minimumCoverage
}

function hasVariableReference(index: TextIndex, key: string, label?: string): boolean {
  const keyNormalized = normalizeText(key)
  const labelNormalized = label ? normalizeText(label) : ''
  if (keyNormalized && index.normalized.includes(keyNormalized)) return true
  if (labelNormalized && index.normalized.includes(labelNormalized)) return true

  return hasAnyToken(index, uniqueTokens(key, label ?? ''))
}

function hasSkipLanguage(index: TextIndex): boolean {
  return /\b(pular|nao perguntar|nao pergunte|evitar perguntar|nao repetir|ja informado|ja souber|ja estiver|se houver|quando houver|se.*contexto|caso.*contexto)\b/.test(
    index.normalized,
  )
}

function hasQuestionPreserved(
  index: TextIndex,
  question: BlueprintQuestion,
  variableLabel?: string,
): boolean {
  const questionTokens = uniqueTokens(question.text, question.purpose)
  const variableTokens = uniqueTokens(question.variableKey, variableLabel ?? '')

  if (hasPhraseOrCoverage(index, question.text)) return true
  if (questionTokens.length > 0 && tokenCoverage(index, questionTokens) >= 0.5) {
    return true
  }

  return (
    hasAnyToken(index, variableTokens) &&
    hasAnyToken(index, uniqueTokens(question.purpose, question.text))
  )
}

function hasRulePreserved(index: TextIndex, rule: string): boolean {
  return hasPhraseOrCoverage(index, rule, 0.5)
}

function hasToolTriggerPreserved(
  index: TextIndex,
  trigger: BlueprintToolTrigger,
): boolean {
  const capabilityPreserved = hasPhraseOrCoverage(index, trigger.capability, 0.5)
  const toolPreserved = trigger.toolKey
    ? hasPhraseOrCoverage(index, trigger.toolKey, 0.5)
    : false
  const momentPreserved = hasPhraseOrCoverage(index, trigger.when, 0.45)

  return (capabilityPreserved || toolPreserved) && momentPreserved
}

function pushIssue(
  issues: BlueprintPreservationIssue[],
  issue: Omit<BlueprintPreservationIssue, 'validator'>,
): void {
  issues.push({
    validator: 'blueprint_preservation',
    ...issue,
  })
}

export function validateBlueprintPreservation({
  prompt,
  blueprint,
}: ValidateBlueprintPreservationInput): BlueprintPreservationResult {
  const issues: BlueprintPreservationIssue[] = []
  const index = buildTextIndex(prompt)
  const variablesByKey = new Map(blueprint.variables.map((v) => [v.key, v]))

  for (const [questionIndex, question] of blueprint.questions.entries()) {
    const variable = variablesByKey.get(question.variableKey)

    if (!hasQuestionPreserved(index, question, variable?.label)) {
      pushIssue(issues, {
        code: 'missing_question',
        severity: 'error',
        path: `questions.${questionIndex}`,
        expected: question.text,
        message: `Pergunta do blueprint ausente no prompt: "${question.text}".`,
      })
    }

    if (!hasVariableReference(index, question.variableKey, variable?.label)) {
      pushIssue(issues, {
        code: 'missing_variable',
        severity: 'error',
        path: `questions.${questionIndex}.variableKey`,
        expected: question.variableKey,
        message: `Variável capturada pela pergunta ausente no prompt: "${question.variableKey}".`,
      })
    }

    if (
      !hasSkipLanguage(index) ||
      !hasRulePreserved(index, question.skipWhenKnown)
    ) {
      pushIssue(issues, {
        code: 'missing_skip_rule',
        severity: 'error',
        path: `questions.${questionIndex}.skipWhenKnown`,
        expected: question.skipWhenKnown,
        message: `Regra de pulo da pergunta ausente ou fraca no prompt: "${question.skipWhenKnown}".`,
      })
    }
  }

  for (const [ruleIndex, rule] of blueprint.skipRules.entries()) {
    if (!hasSkipLanguage(index) || !hasRulePreserved(index, rule.condition)) {
      pushIssue(issues, {
        code: 'missing_skip_rule',
        severity: 'error',
        path: `skipRules.${ruleIndex}`,
        expected: rule.condition,
        message: `Regra explícita de pulo ausente no prompt: "${rule.condition}".`,
      })
    }
  }

  for (const [triggerIndex, trigger] of blueprint.handoffTriggers.entries()) {
    if (!hasRulePreserved(index, trigger)) {
      pushIssue(issues, {
        code: 'missing_handoff_trigger',
        severity: 'error',
        path: `handoffTriggers.${triggerIndex}`,
        expected: trigger,
        message: `Gatilho de handoff ausente no prompt: "${trigger}".`,
      })
    }
  }

  for (const [triggerIndex, trigger] of blueprint.toolTriggers.entries()) {
    if (!hasToolTriggerPreserved(index, trigger)) {
      pushIssue(issues, {
        code: 'missing_tool_trigger',
        severity: trigger.active ? 'error' : 'warning',
        path: `toolTriggers.${triggerIndex}`,
        expected: trigger.toolKey ?? trigger.capability,
        message: `Gatilho de ferramenta ausente ou incompleto no prompt: "${trigger.capability}".`,
      })
    }

    for (const variableKey of trigger.requiredVariables) {
      const variable = variablesByKey.get(variableKey)
      if (!hasVariableReference(index, variableKey, variable?.label)) {
        pushIssue(issues, {
          code: 'missing_tool_required_variable',
          severity: trigger.active ? 'error' : 'warning',
          path: `toolTriggers.${triggerIndex}.requiredVariables`,
          expected: variableKey,
          message: `Variável obrigatória da ferramenta ausente no prompt: "${variableKey}".`,
        })
      }
    }

    if (trigger.fallback && !hasRulePreserved(index, trigger.fallback)) {
      pushIssue(issues, {
        code: 'missing_tool_fallback',
        severity: 'warning',
        path: `toolTriggers.${triggerIndex}.fallback`,
        expected: trigger.fallback,
        message: `Fallback da ferramenta ausente no prompt: "${trigger.fallback}".`,
      })
    }
  }

  for (const [ruleIndex, rule] of blueprint.dontRules.entries()) {
    if (!hasRulePreserved(index, rule)) {
      pushIssue(issues, {
        code: 'missing_dont_rule',
        severity: 'error',
        path: `dontRules.${ruleIndex}`,
        expected: rule,
        message: `Regra de proibição do blueprint ausente no prompt: "${rule}".`,
      })
    }
  }

  return {
    pass: issues.every((issue) => issue.severity !== 'error'),
    issues,
  }
}
