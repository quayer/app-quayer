import type {
  RefinementBlocker,
  RefinementCheckSummary,
  RefinementState,
} from '../cards/builder-state'
import type {
  RefinementScenarioRun,
  RunRefinementInput,
  RunRefinementOutput,
} from './types'
import {
  questionAuditor,
  routeAuditor,
  safetyAuditor,
} from './auditors'

export const DEFAULT_REFINEMENT_AUDITORS = [
  routeAuditor,
  questionAuditor,
  safetyAuditor,
]

function uniqueRunId(): string {
  return `refine_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function checkFromRunnerError(run: RefinementScenarioRun): RefinementCheckSummary {
  return {
    checkId: `runner.${run.scenario.id}`,
    label: `Cenário: ${run.scenario.label}`,
    status: 'fail',
    severity: 'critical',
    evidence: run.error ?? 'O cenário não executou.',
    recommendation: 'Rode o refinamento novamente antes de publicar.',
    autoFixable: false,
  }
}

function scoreChecks(checks: readonly RefinementCheckSummary[]): number {
  if (checks.length === 0) return 100
  const points = checks.reduce((acc, check) => {
    if (check.status === 'pass') return acc + 1
    if (check.status === 'warning') return acc + 0.5
    return acc
  }, 0)
  return Math.round((points / checks.length) * 100)
}

function blockersFromChecks(
  checks: readonly RefinementCheckSummary[],
): RefinementBlocker[] {
  return checks
    .filter((check) => check.status === 'fail' && check.severity === 'critical')
    .map((check) => ({
      checkId: check.checkId,
      severity: 'critical' as const,
      message:
        check.recommendation ??
        check.evidence ??
        `Falha crítica no check ${check.label ?? check.checkId}.`,
      recommendation: check.recommendation,
    }))
}

function statusFromChecks(
  checks: readonly RefinementCheckSummary[],
  blockers: readonly RefinementBlocker[],
): RefinementState['status'] {
  if (blockers.length > 0) return 'failed'
  if (checks.some((check) => check.status === 'fail')) {
    return 'needs_user_decision'
  }
  return 'passed'
}

export async function runRefinement({
  projectId,
  organizationId,
  blueprint,
  scenarios,
  runner,
  auditors,
  runId = uniqueRunId(),
  material,
  now = () => new Date(),
}: RunRefinementInput): Promise<RunRefinementOutput> {
  const startedAt = now().toISOString()
  const runs: RefinementScenarioRun[] = []

  for (const scenario of scenarios) {
    runs.push(await runner({ projectId, organizationId, scenario }))
  }

  const runnerChecks = runs
    .filter((run) => run.error)
    .map(checkFromRunnerError)
  const auditorChecks = auditors.flatMap((auditor) => {
    try {
      return auditor({ blueprint, runs })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Auditor falhou ao executar.'
      return [
        {
          checkId: 'auditor.runtime',
          label: 'Auditor',
          status: 'warning' as const,
          severity: 'medium' as const,
          evidence: message,
          recommendation: 'Reexecutar refinamento.',
          autoFixable: false,
        },
      ]
    }
  })

  const checks = [...runnerChecks, ...auditorChecks]
  const blockers = blockersFromChecks(checks)
  const state: RefinementState = {
    status: statusFromChecks(checks, blockers),
    runId,
    score: scoreChecks(checks),
    startedAt,
    finishedAt: now().toISOString(),
    checks,
    blockers,
    ...(material ? { material } : {}),
  }

  return { state, runs }
}
