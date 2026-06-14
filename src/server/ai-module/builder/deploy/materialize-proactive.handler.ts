/**
 * materializeProactive handler — step "materialize_proactive" da saga de deploy (F1).
 *
 * Materializa a CAPACIDADE "Mensagens proativas" coletada no `builderState.proactive`
 * (3 toggles opt-in — FR-PRO-01) nas REGRAS de runtime `ScheduledAutomation`
 * (FR-PRO-02), para que o motor de proatividade (F2/F3/F4) tenha as regras
 * DECLARATIVAS do projeto. Hoje os toggles morrem no JSONB; este step fecha isso.
 *
 * Espelho EXATO de `materialize-pricing.handler.ts` / `materialize-team.handler.ts`:
 *   - read fail-open do builderState (`readBuilderStateByProject` + `parseBuilderState`
 *     nunca lançam; state ausente/garbage ⇒ `proactive: undefined` ⇒ desired vazio ⇒
 *     TODAS as automações do projeto são PAUSADAS — degrada sem derrubar a saga);
 *   - tradução PURA toggles→regras via `deriveProactiveRules` (sibling unit-testável);
 *   - RECONCILIAÇÃO org/project-scoped dentro de um `$transaction`. `ScheduledAutomation`
 *     NÃO tem unique (só `@@index([organizationId, projectId])`) — logo é
 *     read-modify-reconcile EM MEMÓRIA (NÃO upsert), com a chave determinística de
 *     identidade `trigger` dentro de `(organizationId, projectId)`:
 *       · state ∩ DB → update (timing/template/cancelRules/maxAttempts, status='active')
 *       · state \ DB → create
 *       · DB \ state → update status='paused' (NUNCA hard-delete — "desativa, nunca
 *         apaga", igual ao pricing/team; o scanner futuro ignora status!=='active').
 *
 * Folha da saga (sem editar nada existente além dos couplings do orchestrator/
 * contract/rollback, feitos em outra fatia). Carrega o builderState LAZY (fail-open:
 * nunca lança no caminho de read). PODE lançar em falha de DB de ESCRITA
 * (create/update na transaction) para acionar o rollback como os demais steps.
 *
 * Acesso ao delegate `scheduledAutomation` via o MESMO guard defensivo dos outros
 * steps (delegate estrutural): se a migration `proactive_scheduling` não landou
 * (delegate ausente), o step degrada para no-op (NÃO lança).
 *
 * Além das regras, DERIVA a tool `create_followup` no agente (FR-PRO-01): o toggle
 * `proactive.followUp` → `AIAgentConfig.enabledTools` (set-merge que preserva tools
 * custom, igual a materialize_pricing/team). Sem isto o card salvava o toggle mas o
 * agente publicado nunca ganhava a capacidade de agendar follow-ups (catálogo órfão).
 *
 * Toca tabelas:
 *   - scheduled_automations (reconciliação: findMany + create/update/pause)
 *   - AIAgentConfig         (UPDATE enabledTools — derivação de `create_followup`)
 *
 * REGRAS: TS strict, zero `any`; tudo org-scoped por `ctx.organizationId` +
 * `ctx.projectId`; idempotente (rodar 2x converge ao mesmo estado).
 */

import type { Prisma } from '@prisma/client'

import { database } from '@/server/services/database'
import { readBuilderStateByProject } from '../sources/builder-state-db'
import { parseBuilderState } from '../cards/builder-state'
import {
  deriveProactiveRules,
  reconcileProactiveRules,
} from './proactive-rules.derive'
import {
  deriveProactiveToolChanges,
  reconcileEnabledTools,
} from './enabled-tools-derivation'
import type { DeployContext } from './deploy.contract'

// ==========================================
// Resultado do step
// ==========================================

/** Resultado do step — payload descritivo (compatível com `runStep`). */
export interface MaterializeProactiveResult {
  /** Nº de regras ATIVAS (criadas + atualizadas) após a reconciliação. */
  activeCount: number
  created: number
  updated: number
  paused: number
}

// ==========================================
// Acesso defensivo ao delegate scheduledAutomation (migration pode não ter landado)
// ==========================================

interface ScheduledAutomationReconcileRow {
  id: string
  trigger: string
  status: string
}

/**
 * Subconjunto estrutural do delegate `scheduledAutomation` usado por este step.
 * Estrutural de propósito (mesma razão de `round-robin.service.ts` / materialize_team):
 * NÃO cria dependência hard de compilação, e permite degradar para no-op quando a
 * migration não landou (delegate ausente).
 */
interface ScheduledAutomationReconcileDelegate {
  findMany: (args: {
    where: Record<string, unknown>
    select?: Record<string, unknown>
  }) => Promise<ScheduledAutomationReconcileRow[]>
  create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>
  update: (args: {
    where: { id: string }
    data: Record<string, unknown>
  }) => Promise<unknown>
}

/** Guard defensivo: delegate ou null se ausente (migration não landou). */
function getScheduledAutomationDelegate(
  tx: Prisma.TransactionClient,
): ScheduledAutomationReconcileDelegate | null {
  const delegate = (tx as unknown as {
    scheduledAutomation?: ScheduledAutomationReconcileDelegate
  }).scheduledAutomation
  return delegate ?? null
}

// ==========================================
// materializeProactive (folha da saga)
// ==========================================

/**
 * materializeProactive — materializa a capacidade proativa do `builderState` nas
 * regras `ScheduledAutomation`. Idempotente e org/project-scoped.
 *
 * FAIL-OPEN no read do builderState: `readBuilderStateByProject` + `parseBuilderState`
 * nunca lançam (backfill para default em qualquer falha), então um state
 * ausente/garbage resulta em `proactive: undefined` ⇒ desired vazio ⇒ todas as
 * automações do projeto são pausadas — degrada sem derrubar a saga.
 *
 * PODE lançar em falha de DB de ESCRITA (create/update na transaction) para acionar o
 * rollback como os demais steps.
 */
export async function materializeProactive(
  ctx: DeployContext,
): Promise<MaterializeProactiveResult> {
  // 1. Carrega o builderState LAZY (fail-open: nenhum desses lança).
  const state = parseBuilderState(await readBuilderStateByProject(ctx.projectId))

  // 2. Tradução PURA dos 3 toggles → regras de runtime. `proactive` undefined ou todos
  //    os toggles false ⇒ desired vazio (clear-on-empty: pausa todas as regras).
  const desired = deriveProactiveRules(state.proactive)

  // 3. Reconciliação org/project-scoped dentro de um $transaction (read-modify-reconcile
  //    em memória — NÃO há unique p/ upsert). Match-by-trigger:
  //      - state ∩ DB → update (status='active')
  //      - state \ DB → create
  //      - DB \ state → update status='paused' (NUNCA hard-delete)
  //    Escopo garantido por organizationId + projectId em TODO query. Acesso ao
  //    delegate via guard defensivo — se ausente (migration não landou), no-op (NÃO
  //    lança). Idempotente: rodar 2x converge ao mesmo estado.
  let created = 0
  let updated = 0
  let paused = 0
  await database.$transaction(async (tx) => {
    const delegate = getScheduledAutomationDelegate(tx)
    if (!delegate) {
      // Migration `proactive_scheduling` ainda não landou — degrada para no-op.
      console.warn(
        '[deploy/materialize_proactive] delegate scheduledAutomation ausente — ' +
          'reconciliação pulada (degradando; migration proactive_scheduling não landou)',
      )
      return
    }

    const existingRows = await delegate.findMany({
      where: {
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
      },
      select: { id: true, trigger: true, status: true },
    })
    const statusById = new Map(existingRows.map((r) => [r.id, r.status]))

    const plan = reconcileProactiveRules(existingRows, desired)

    // Guard de observabilidade: desired vazio pausa TODA regra ativa (mesma semântica
    // intencional do pricing/team). Acontece quando o usuário desligou a capacidade ou
    // o read do state degradou. Loga em alto nível para não confundir um deploy futuro.
    if (desired.length === 0 && existingRows.some((r) => r.status === 'active')) {
      console.warn(
        '[deploy/materialize_proactive] desired vazio (capacidade proativa desligada ' +
          'ou state ausente), mas há automação(ões) ativa(s) — TODAS serão pausadas. ' +
          'Se for leitura transitória do state, re-deploy reconcilia.',
      )
    }

    for (const rule of plan.toUpdate) {
      await delegate.update({
        where: { id: rule.id },
        data: {
          audience: rule.audience,
          timing: rule.timing as Prisma.InputJsonValue,
          messageTemplate: rule.messageTemplate,
          cancelRules: { set: rule.cancelRules },
          maxAttempts: rule.maxAttempts,
          status: 'active',
        },
      })
      updated += 1
    }
    for (const rule of plan.toCreate) {
      await delegate.create({
        data: {
          organizationId: ctx.organizationId,
          projectId: ctx.projectId,
          trigger: rule.trigger,
          audience: rule.audience,
          timing: rule.timing as Prisma.InputJsonValue,
          messageTemplate: rule.messageTemplate,
          cancelRules: { set: rule.cancelRules },
          maxAttempts: rule.maxAttempts,
          status: 'active',
        },
      })
      created += 1
    }
    // Pausa (nunca apaga) — só as que ainda não estavam pausadas (evita write no-op e
    // conta certo). `toPause` já inclui as duplicatas históricas por trigger.
    for (const id of plan.toPause) {
      if (statusById.get(id) === 'paused') continue
      await delegate.update({ where: { id }, data: { status: 'paused' } })
      paused += 1
    }
  })

  // 4. DERIVA a tool `create_followup` no agente (FR-PRO-01): followUp ON → garante
  //    a tool em `AIAgentConfig.enabledTools`; OFF/ausente → remove (sem isto o card
  //    salva o toggle mas o agente publicado nunca ganha a capacidade — catálogo
  //    órfão). Espelha o padrão de materialize_pricing/team: cada handler deriva a
  //    SUA tool lendo `enabledTools` FRESCO e faz um set-merge (preserva tools custom)
  //    num UPDATE atômico, só quando muda — idempotente. Sequencial na saga (roda
  //    depois de team), então lê o array já reconciliado pelos steps anteriores.
  //    Independente do delegate scheduledAutomation: a capacidade é declarada mesmo
  //    se a migration de regras não landou (o runtime degrada na própria tool).
  //    PODE lançar em falha de DB de escrita (aciona rollback como os outros steps).
  if (ctx.aiAgentId) {
    const agent = await database.aIAgentConfig.findFirst({
      where: { id: ctx.aiAgentId, organizationId: ctx.organizationId },
      select: { enabledTools: true },
    })
    if (agent) {
      const tools = reconcileEnabledTools(agent.enabledTools, [
        deriveProactiveToolChanges(state.proactive),
      ])
      if (tools.changed) {
        await database.aIAgentConfig.update({
          where: { id: ctx.aiAgentId },
          data: { enabledTools: { set: tools.next } },
        })
      }
    }
  }

  return { activeCount: desired.length, created, updated, paused }
}

/**
 * compensateMaterializeProactive — compensação no rollback da saga.
 *
 * Fail-open e self-contained, IGUAL ao `compensateMaterializePricing/Team`: o `ctx`
 * reconstruído pelo rollback handler NÃO carrega o bookkeeping desta run, então a
 * compensação NÃO pode depender de `ctx.state`. As automações refletem o que o USUÁRIO
 * configurou (não é "lixo de deploy"), então a compensação correta é um NO-OP
 * idempotente: não desfazer as regras (a reconciliação roda de novo no próximo deploy,
 * e o scanner futuro só dispara status='active' — uma regra órfã de um deploy revertido
 * será re-pausada/re-ativada conforme o builderState atual). Nunca lança.
 */
export async function compensateMaterializeProactive(
  ctx: DeployContext,
): Promise<void> {
  // No-op idempotente: as automações são fonte de verdade do usuário e a materialização
  // é reversível pela própria reconciliação no próximo deploy. `void ctx` evita lint de
  // parâmetro não usado mantendo a assinatura do contrato de compensação.
  void ctx
}
