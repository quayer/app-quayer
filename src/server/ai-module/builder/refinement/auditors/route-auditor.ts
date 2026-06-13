import type { RefinementCheckSummary } from '../../cards/builder-state'
import type {
  BlueprintQuestion,
  BlueprintStage,
  BlueprintVariable,
} from '../../playbook/blueprint.schema'
import type {
  RefinementAuditor,
  RefinementScenarioRun,
  RefinementTranscriptTurn,
} from '../types'
import { questionMatchesTurn } from './blueprint-matching'
import {
  buildTextIndex,
  compactEvidence,
  hasPhraseOrCoverage,
  safeCheckId,
} from './text-matching'

interface AssistantTurn {
  run: RefinementScenarioRun
  turn: RefinementTranscriptTurn
  turnIndex: number
}

interface Observation {
  runId: string
  runLabel: string
  turnIndex: number
  content: string
}

function assistantTurns(runs: readonly RefinementScenarioRun[]): AssistantTurn[] {
  return runs.flatMap((run) =>
    run.transcript
      .map((turn, turnIndex) => ({ run, turn, turnIndex }))
      .filter((item) => item.turn.role === 'assistant'),
  )
}

function firstByTurn(
  current: Observation | undefined,
  next: Observation,
): Observation {
  if (!current) return next
  if (next.turnIndex < current.turnIndex) return next
  return current
}

function questionObservation(
  question: BlueprintQuestion,
  variable: BlueprintVariable | undefined,
  turns: readonly AssistantTurn[],
): Observation | undefined {
  let match: Observation | undefined

  for (const item of turns) {
    if (!questionMatchesTurn(question, variable, item.turn.content)) continue

    match = firstByTurn(match, {
      runId: item.run.scenario.id,
      runLabel: item.run.scenario.label,
      turnIndex: item.turnIndex,
      content: item.turn.content,
    })
  }

  return match
}

function stageObservation(
  stage: BlueprintStage,
  turns: readonly AssistantTurn[],
  questionObservations: ReadonlyMap<string, Observation>,
  stageQuestions: readonly BlueprintQuestion[],
): Observation | undefined {
  let match: Observation | undefined

  for (const question of stageQuestions) {
    const observed = questionObservations.get(question.id)
    if (observed) {
      match = firstByTurn(match, observed)
    }
  }

  for (const item of turns) {
    const index = buildTextIndex(item.turn.content)
    if (
      !hasPhraseOrCoverage(index, stage.title, 0.55) &&
      !hasPhraseOrCoverage(index, stage.goal, 0.5)
    ) {
      continue
    }

    match = firstByTurn(match, {
      runId: item.run.scenario.id,
      runLabel: item.run.scenario.label,
      turnIndex: item.turnIndex,
      content: item.turn.content,
    })
  }

  return match
}

function routeCheck(
  checkId: string,
  label: string,
  status: RefinementCheckSummary['status'],
  severity: RefinementCheckSummary['severity'],
  evidence: string,
  recommendation: string,
  autoFixable: boolean,
): RefinementCheckSummary {
  return {
    checkId,
    label,
    status,
    severity,
    evidence: compactEvidence(evidence),
    recommendation,
    autoFixable,
  }
}

function orderedStages(stages: readonly BlueprintStage[]): BlueprintStage[] {
  return [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

function groupQuestionsByStage(
  questions: readonly BlueprintQuestion[],
): Map<string, BlueprintQuestion[]> {
  const grouped = new Map<string, BlueprintQuestion[]>()

  for (const question of questions) {
    const stageId = question.stageId ?? ''
    const current = grouped.get(stageId) ?? []
    current.push(question)
    grouped.set(stageId, current)
  }

  return grouped
}

function orderedQuestionsForRoute(
  questions: readonly BlueprintQuestion[],
  stages: readonly BlueprintStage[],
): BlueprintQuestion[] {
  const stageOrder = new Map(stages.map((stage) => [stage.id, stage.order ?? 0]))

  return [...questions].sort((a, b) => {
    const stageDelta =
      (stageOrder.get(a.stageId ?? '') ?? 0) -
      (stageOrder.get(b.stageId ?? '') ?? 0)
    if (stageDelta !== 0) return stageDelta

    return (a.order ?? 0) - (b.order ?? 0)
  })
}

function detectQuestionOrderViolations(
  run: RefinementScenarioRun,
  questions: readonly BlueprintQuestion[],
  stages: readonly BlueprintStage[],
  variablesByKey: ReadonlyMap<string, BlueprintVariable>,
): RefinementCheckSummary[] {
  const seen = new Map<string, number>()

  for (const [turnIndex, turn] of run.transcript.entries()) {
    if (turn.role !== 'assistant') continue

    for (const question of questions) {
      if (seen.has(question.id)) continue
      if (
        questionMatchesTurn(
          question,
          variablesByKey.get(question.variableKey),
          turn.content,
        )
      ) {
        seen.set(question.id, turnIndex)
      }
    }
  }

  const checks: RefinementCheckSummary[] = []
  const sorted = orderedQuestionsForRoute(questions, stages)

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1]
    const current = sorted[i]
    if (!previous || !current) continue

    const previousTurn = seen.get(previous.id)
    const currentTurn = seen.get(current.id)
    if (
      previousTurn === undefined ||
      currentTurn === undefined ||
      previousTurn <= currentTurn
    ) {
      continue
    }

    checks.push(
      routeCheck(
        safeCheckId('route', 'question_order', run.scenario.id, current.id),
        'Plano de atendimento',
        'fail',
        'high',
        `No cenario "${run.scenario.label}", a pergunta "${current.text}" apareceu antes de "${previous.text}".`,
        'Ajustar o prompt para preservar a ordem aprovada das perguntas.',
        true,
      ),
    )
  }

  return checks
}

function detectStageOrderViolations(
  runs: readonly RefinementScenarioRun[],
  stages: readonly BlueprintStage[],
): RefinementCheckSummary[] {
  const sortedStages = orderedStages(stages)
  const checks: RefinementCheckSummary[] = []

  for (const run of runs) {
    const firstSeen = new Map<string, number>()

    for (const [turnIndex, turn] of run.transcript.entries()) {
      if (turn.role !== 'assistant') continue

      const index = buildTextIndex(turn.content)
      for (const stage of sortedStages) {
        if (firstSeen.has(stage.id)) continue
        if (
          hasPhraseOrCoverage(index, stage.title, 0.55) ||
          hasPhraseOrCoverage(index, stage.goal, 0.5)
        ) {
          firstSeen.set(stage.id, turnIndex)
        }
      }
    }

    for (let i = 1; i < sortedStages.length; i += 1) {
      const previous = sortedStages[i - 1]
      const current = sortedStages[i]
      if (!previous || !current) continue

      const previousTurn = firstSeen.get(previous.id)
      const currentTurn = firstSeen.get(current.id)
      if (
        previousTurn === undefined ||
        currentTurn === undefined ||
        previousTurn <= currentTurn
      ) {
        continue
      }

      checks.push(
        routeCheck(
          safeCheckId('route', 'stage_order', run.scenario.id, current.id),
          'Plano de atendimento',
          'fail',
          'high',
          `No cenario "${run.scenario.label}", a etapa "${current.title}" apareceu antes de "${previous.title}".`,
          'Reordenar as instrucoes para seguir as etapas aprovadas.',
          true,
        ),
      )
    }
  }

  return checks
}

export const routeAuditor: RefinementAuditor = ({ blueprint, runs }) => {
  const turns = assistantTurns(runs.filter((run) => !run.error))
  if (turns.length === 0) {
    return [
      routeCheck(
        'route.no_transcript',
        'Plano de atendimento',
        'warning',
        'medium',
        'Nenhuma mensagem do agente ficou disponivel para auditoria de roteiro.',
        'Reexecutar o refinamento com pelo menos um cenario conversacional.',
        false,
      ),
    ]
  }

  const variablesByKey = new Map(blueprint.variables.map((v) => [v.key, v]))
  const questionObservations = new Map<string, Observation>()
  const checks: RefinementCheckSummary[] = []

  for (const question of blueprint.questions) {
    const observed = questionObservation(
      question,
      variablesByKey.get(question.variableKey),
      turns,
    )

    if (observed) {
      questionObservations.set(question.id, observed)
      continue
    }

    checks.push(
      routeCheck(
        safeCheckId('route', 'missing_question', question.id),
        'Plano de atendimento',
        question.required ? 'fail' : 'warning',
        question.required ? 'critical' : 'medium',
        `Pergunta ausente nos transcripts auditados: "${question.text}".`,
        'Reforcar no prompt final que esta pergunta do blueprint deve ser feita quando a informacao nao estiver conhecida.',
        true,
      ),
    )
  }

  const questionsByStage = groupQuestionsByStage(blueprint.questions)

  for (const stage of blueprint.stages) {
    const stageQuestions = questionsByStage.get(stage.id) ?? []
    const observed = stageObservation(
      stage,
      turns,
      questionObservations,
      stageQuestions,
    )
    if (observed) continue

    const hasRequiredQuestion = stageQuestions.some((question) => question.required)
    checks.push(
      routeCheck(
        safeCheckId('route', 'missing_stage', stage.id),
        'Plano de atendimento',
        hasRequiredQuestion ? 'fail' : 'warning',
        hasRequiredQuestion ? 'critical' : 'medium',
        `Etapa ausente nos transcripts auditados: "${stage.title}".`,
        'Reforcar a etapa aprovada no prompt ou nos cenarios de refinamento.',
        true,
      ),
    )
  }

  checks.push(
    ...detectStageOrderViolations(
      runs.filter((run) => !run.error),
      blueprint.stages,
    ),
    ...runs
      .filter((run) => !run.error)
      .flatMap((run) =>
        detectQuestionOrderViolations(
          run,
          blueprint.questions,
          blueprint.stages,
          variablesByKey,
        ),
      ),
  )

  if (checks.length > 0) return checks

  return [
    routeCheck(
      'route',
      'Plano de atendimento',
      'pass',
      'low',
      'Os transcripts auditados cobrem as etapas e perguntas aprovadas.',
      'Nenhuma acao necessaria.',
      false,
    ),
  ]
}

export function auditRoute(
  input: Parameters<RefinementAuditor>[0],
): RefinementCheckSummary[] {
  return routeAuditor(input)
}
