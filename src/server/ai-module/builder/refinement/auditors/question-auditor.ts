import type { RefinementCheckSummary } from '../../cards/builder-state'
import type {
  BlueprintQuestion,
  BlueprintVariable,
} from '../../playbook/blueprint.schema'
import type {
  RefinementAuditor,
  RefinementScenarioRun,
  RefinementTranscriptTurn,
} from '../types'
import {
  isQuestionLike,
  questionMatchesTurn,
  userTurnLooksKnownForQuestion,
} from './blueprint-matching'
import { compactEvidence, normalizeText, safeCheckId } from './text-matching'

interface TurnRef {
  run: RefinementScenarioRun
  turn: RefinementTranscriptTurn
  turnIndex: number
}

function questionCheck(
  checkId: string,
  status: RefinementCheckSummary['status'],
  severity: RefinementCheckSummary['severity'],
  evidence: string,
  recommendation: string,
): RefinementCheckSummary {
  return {
    checkId,
    label: 'Perguntas',
    status,
    severity,
    evidence: compactEvidence(evidence),
    recommendation,
    autoFixable: status !== 'pass',
  }
}

function estimateQuestionCount(content: string): number {
  const questionMarks = (content.match(/\?/g) ?? []).length
  const normalized = normalizeText(content)
  if (questionMarks === 0 && !isQuestionLike(content)) return 0

  const explicitFollowUps = (
    normalized.match(
      /\b(e|ou)\s+(qual|quais|quando|onde|como|quanto|quantos|quem|tem|possui|deseja|prefere|quer)\b/g,
    ) ?? []
  ).length

  return Math.max(questionMarks, questionMarks + explicitFollowUps)
}

function turnRefs(runs: readonly RefinementScenarioRun[]): TurnRef[] {
  return runs.flatMap((run) =>
    run.transcript.map((turn, turnIndex) => ({ run, turn, turnIndex })),
  )
}

function previousUserTurns(
  run: RefinementScenarioRun,
  turnIndex: number,
): RefinementTranscriptTurn[] {
  return run.transcript
    .slice(0, turnIndex)
    .filter((turn) => turn.role === 'user')
}

function hasKnownAnswerBeforeTurn(
  question: BlueprintQuestion,
  variable: BlueprintVariable | undefined,
  run: RefinementScenarioRun,
  turnIndex: number,
): boolean {
  return previousUserTurns(run, turnIndex).some((turn) =>
    userTurnLooksKnownForQuestion(question, variable, turn.content),
  )
}

export const questionAuditor: RefinementAuditor = ({ blueprint, runs }) => {
  const checks: RefinementCheckSummary[] = []
  const variablesByKey = new Map(blueprint.variables.map((v) => [v.key, v]))
  const refs = turnRefs(runs.filter((run) => !run.error))

  for (const item of refs) {
    if (item.turn.role !== 'assistant') continue

    const count = estimateQuestionCount(item.turn.content)
    if (count <= 1) continue

    checks.push(
      questionCheck(
        safeCheckId(
          'question',
          'multi_turn',
          item.run.scenario.id,
          String(item.turnIndex),
        ),
        'fail',
        'high',
        `No cenario "${item.run.scenario.label}", o agente fez ${count} perguntas no mesmo turno: "${item.turn.content}".`,
        'Dividir o turno em uma unica pergunta objetiva e aguardar a resposta do lead.',
      ),
    )
  }

  for (const question of blueprint.questions) {
    const variable = variablesByKey.get(question.variableKey)
    const matchedTurns = refs.filter(
      (item) =>
        item.turn.role === 'assistant' &&
        questionMatchesTurn(question, variable, item.turn.content),
    )

    for (const item of matchedTurns) {
      if (
        !hasKnownAnswerBeforeTurn(question, variable, item.run, item.turnIndex)
      ) {
        continue
      }

      checks.push(
        questionCheck(
          safeCheckId('question', 'repeated_known', question.id),
          'fail',
          'high',
          `A pergunta "${question.text}" foi feita no cenario "${item.run.scenario.label}" mesmo apos o usuario ja informar esse dado.`,
          `Aplicar a regra de pulo: ${question.skipWhenKnown}`,
        ),
      )
      break
    }
  }

  if (checks.length > 0) return checks

  return [
    questionCheck(
      'question',
      'pass',
      'low',
      'Os turnos do agente mantiveram uma pergunta por vez e respeitaram os dados ja informados.',
      'Nenhuma acao necessaria.',
    ),
  ]
}

export function auditQuestions(
  input: Parameters<RefinementAuditor>[0],
): RefinementCheckSummary[] {
  return questionAuditor(input)
}
