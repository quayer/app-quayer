/**
 * materializeTeam handler — step "materialize_team" da saga de deploy (M1).
 *
 * Materializa o handoff de EQUIPE coletado no `builderState` (Onda 2, card unificado
 * `handoff` — fusão de qualification_action + qualification_steps + team_structure +
 * handoff_pairing) nos modelos de RUNTIME (Department + DepartmentMember) para que a
 * ROLETA (round-robin) roteie o lead ao próximo atendente humano — e, na M1/decisão
 * 6A, notifique-o por WhatsApp.
 *
 * Onda 2 — modo→roteamento do runtime:
 *   - 'solo'          → transfer_to_human routing 'self' (sem roleta);
 *   - 'roleta'        → routing 'department' (roleta neste Department) — MATERIALIZA;
 *   - 'departamentos' → routing 'department' (idem) — MATERIALIZA;
 *   - 'nenhum'/ausente→ sem handoff de equipe (sem roleta).
 * `handoff.alsoSchedule` (ORTOGONAL ao modo) substitui o antigo
 * `qualification.action==='book_appointment'` para gatear a agenda — porém a AGENDA é
 * materializada por OUTRO step (calendar), não aqui. Este step só cuida da roleta:
 * a roleta (Department + membros ativos + bloco/vínculo no agente) só é materializada
 * quando o modo é 'roleta' OU 'departamentos'; em 'solo'/'nenhum' o desired é vazio
 * (tear-down dos membros legados) e o agente não recebe o bloco/vínculo de roleta.
 *
 * Espelho EXATO de `materialize-pricing.handler.ts` (M2):
 *   - read fail-open do builderState (`readBuilderStateByProject` + `parseBuilderState`
 *     nunca lançam; state ausente/garbage => team vazio => TODOS os membros do DB
 *     deste departamento são desativados — degrada sem derrubar a saga);
 *   - UPSERT org-scoped do Department do projeto. NÃO há `@@unique([organizationId,
 *     name])` em Department — o unique é `@@unique([organizationId, slug])`. Logo a
 *     chave DETERMINÍSTICA é o SLUG: `team:${projectId}` (estável). É o análogo do
 *     upsert da PriceList por `pricing:${projectId}`;
 *   - RECONCILIAÇÃO dos membros em memória dentro de um `$transaction` (o
 *     `@@unique([departmentId, userId])` SÓ cobre membros-usuário; NULLs são distintos
 *     no Postgres, então membros nome+whatsapp NÃO têm unique e exigem reconcile
 *     manual — exatamente o motivo do read-modify-reconcile do pricing);
 *   - grava o vínculo ESTRUTURADO na coluna `AIAgentConfig.departmentId` (fonte
 *     AUTORITATIVA do id, análogo ao `AIAgentConfig.priceListId = list.id` do pricing)
 *     E injeta um bloco DETERMINÍSTICO de roleta no `AIAgentConfig.systemPrompt` entre
 *     marcadores (idempotente — regex substitui o bloco; se não houver, append) como
 *     HINT redundante (ensina o LLM o nome do dept + que PODE dispatchar). O dispatch
 *     `dispatch_to_agent` lê a coluna via `ctx.agentDepartmentId` como FALLBACK quando
 *     o LLM não passa um departmentId — robusto a qual prompt vence (o bloco pode ser
 *     sombreado por um AgentPromptVersion ACTIVE).
 *
 * Folha da saga (sem editar nada existente além dos couplings do orchestrator/
 * contract/rollback, feitos em outra fatia). Carrega o builderState LAZY (fail-open:
 * nunca lança no caminho de read). PODE lançar em falha de DB de ESCRITA (upsert do
 * dept / transaction de membros / update do prompt) para acionar o rollback como os
 * outros steps.
 *
 * Acesso ao delegate `departmentMember` via o MESMO guard defensivo de
 * `round-robin.service.ts`: se a migration `department_member_whatsapp` não landou
 * (delegate ausente), a reconciliação degrada para no-op (NÃO lança; o Department em
 * si já foi criado).
 *
 * FR-09/FR-10/FR-11 (jornada-builder-v2): as TOOLS do agente são DERIVADAS aqui
 * (set-merge via `enabled-tools-derivation`, preserva tools custom, mesmo UPDATE
 * atômico do agente):
 *   - modo solo/roleta/departamentos → garante `transfer_to_human` (+ `create_lead`
 *     quando há roteiro de qualificação — o que o antigo `qualified_handoff` anexava);
 *     modo 'nenhum' → remove `transfer_to_human`; modo AUSENTE → neutro (opt-in FR-08);
 *   - `alsoSchedule` + conexão de agenda ATIVA (probe espelha resolveCalendarAccess)
 *     → garante as 4 tools de calendário e remove o fallback; SEM conexão → fallback
 *     `schedule_appointment` (log claro); sem alsoSchedule → remove todas.
 *
 * Toca tabelas:
 *   - Department        (UPSERT por @@unique([organizationId, slug]))
 *   - department_members (reconciliação: findMany + create/update/deactivate)
 *   - organization_providers (READ — probe de conexão de agenda, fail-open)
 *   - AIAgentConfig     (UPDATE departmentId — vínculo estruturado autoritativo —
 *                        + systemPrompt — bloco de roleta entre marcadores como hint —
 *                        + enabledTools — derivação determinística FR-09/FR-10)
 *
 * REGRAS: TS strict, zero `any`; tudo org-scoped por `ctx.organizationId`;
 * idempotente (rodar 2x converge ao mesmo estado).
 */

import type { Prisma } from '@prisma/client'

import { database } from '@/server/services/database'
import { readBuilderStateByProject } from '../sources/builder-state-db'
import { parseBuilderState } from '../cards/builder-state'
import {
  sanitizeTeamMembersForRuntime,
  reconcileTeamMembers,
} from './team-reconcile'
import {
  deriveCalendarToolChanges,
  deriveHandoffToolChanges,
  hasActiveCalendarConnection,
  reconcileEnabledTools,
} from './enabled-tools-derivation'
import type { DeployContext } from './deploy.contract'

// ==========================================
// Resultado do step
// ==========================================

/** Resultado do step — payload descritivo (compatível com `runStep`). */
export interface MaterializeTeamResult {
  departmentId: string
  upserted: number
  deactivated: number
}

// ==========================================
// Bloco determinístico de roleta no systemPrompt (idempotente)
// ==========================================

const ROULETTE_BLOCK_START = '<!--ROLETA:start-->'
const ROULETTE_BLOCK_END = '<!--ROLETA:end-->'

/**
 * Constrói o bloco DETERMINÍSTICO de roleta que ensina o LLM do agente deployado a
 * encaminhar para o setor via a tool UNIFICADA `transfer_to_human` com
 * `routing='department'` + o `departmentId` certo. (Internamente, essa rota delega
 * ao `executeDispatchToAgent`; o antigo alias `dispatch_to_agent` foi REMOVIDO.)
 * Estável (mesmo input => mesmo texto) para idempotência da reconciliação do prompt.
 */
function buildRouletteBlock(departmentId: string, departmentName: string): string {
  return [
    ROULETTE_BLOCK_START,
    '## Roleta de atendimento',
    `Quando precisar encaminhar para um atendente humano deste setor, chame a tool ` +
      `transfer_to_human com routing='department' e departmentId='${departmentId}' ` +
      `(departamento '${departmentName}').`,
    ROULETTE_BLOCK_END,
  ].join('\n')
}

/**
 * Aplica o bloco de roleta ao `systemPrompt` de forma IDEMPOTENTE:
 *  - se já existir um bloco entre os marcadores, SUBSTITUI exatamente esse trecho;
 *  - se não existir, faz APPEND (separado por uma linha em branco quando há prompt).
 *
 * Pura: não toca DB, não muta o input. Retorna o novo systemPrompt.
 */
export function applyRouletteBlock(
  systemPrompt: string | null,
  block: string,
): string {
  const current = systemPrompt ?? ''
  // Regex DOTALL (`[\s\S]`) para casar o bloco multilinha entre os marcadores.
  const blockPattern = new RegExp(
    `${escapeRegExp(ROULETTE_BLOCK_START)}[\\s\\S]*?${escapeRegExp(
      ROULETTE_BLOCK_END,
    )}`,
  )
  if (blockPattern.test(current)) {
    return current.replace(blockPattern, block)
  }
  if (current.trim().length === 0) return block
  return `${current}\n\n${block}`
}

/**
 * Remove um bloco de roleta entre os marcadores do `systemPrompt` de forma
 * IDEMPOTENTE (tear-down quando o modo deixa de ser roleta — solo/nenhum). Tira
 * também a linha em branco que o `applyRouletteBlock` injeta no append. Pura:
 * não toca DB, não muta o input. Retorna o systemPrompt sem o bloco (string vazia
 * vira string vazia; nenhum bloco presente => o prompt inalterado).
 */
export function stripRouletteBlock(systemPrompt: string | null): string {
  const current = systemPrompt ?? ''
  const blockPattern = new RegExp(
    // `\n*` à esquerda absorve o separador `\n\n` do append (evita sobra de linhas).
    `\\n*${escapeRegExp(ROULETTE_BLOCK_START)}[\\s\\S]*?${escapeRegExp(
      ROULETTE_BLOCK_END,
    )}`,
  )
  return current.replace(blockPattern, '')
}

/** Escapa metacaracteres de regex (os marcadores têm `<`, `-`, `>`). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ==========================================
// Acesso defensivo ao delegate departmentMember (migration pode não ter landado)
// ==========================================

interface DepartmentMemberReconcileRow {
  id: string
  userId: string | null
  whatsapp: string | null
  name: string | null
  isActive: boolean
}

/**
 * Subconjunto estrutural do delegate `departmentMember` usado por este step.
 * Estrutural de propósito (mesma razão de `round-robin.service.ts`): NÃO cria
 * dependência hard de compilação no model gerado, e permite degradar para no-op
 * quando a migration não landou (delegate ausente).
 */
interface DepartmentMemberReconcileDelegate {
  findMany: (args: {
    where: Record<string, unknown>
    select?: Record<string, unknown>
  }) => Promise<DepartmentMemberReconcileRow[]>
  create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>
  update: (args: {
    where: { id: string }
    data: Record<string, unknown>
  }) => Promise<unknown>
}

/** Mesmo guard de `round-robin.service.ts`: delegate ou null se ausente. */
function getDepartmentMemberDelegate(
  tx: Prisma.TransactionClient,
): DepartmentMemberReconcileDelegate | null {
  const delegate = (tx as unknown as {
    departmentMember?: DepartmentMemberReconcileDelegate
  }).departmentMember
  return delegate ?? null
}

// ==========================================
// materializeTeam (folha da saga)
// ==========================================

/**
 * materializeTeam — materializa o team do `builderState` nos modelos de runtime.
 * Idempotente e org-scoped.
 *
 * FAIL-OPEN no read do builderState: `readBuilderStateByProject` + `parseBuilderState`
 * nunca lançam, então um state ausente/garbage resulta num Department vazio e
 * reconciliado (todos os membros órfãos desativados) — degrada sem derrubar a saga.
 *
 * PODE lançar em falha de DB de ESCRITA (upsert do dept / transaction de membros /
 * update do prompt) para acionar o rollback como os demais steps.
 */
export async function materializeTeam(
  ctx: DeployContext,
): Promise<MaterializeTeamResult> {
  // 1. Carrega o builderState LAZY (fail-open: nenhum desses lança).
  const state = parseBuilderState(await readBuilderStateByProject(ctx.projectId))
  // Onda 2 — `state.team`/`state.qualification` foram FUNDIDOS em `state.handoff`
  // (action+steps+roster+openingMessage num único card). Lemos tudo daqui.
  const handoff = state.handoff

  // Mapeamento modo→roteamento do runtime:
  //   solo            → transfer_to_human routing 'self' (não cria roleta)
  //   roleta          → routing 'department' (roleta round-robin neste Department)
  //   departamentos   → routing 'department' (idem; vários setores compartilham o modelo)
  //   nenhum / ausente→ sem handoff de equipe (não cria roleta)
  // A roleta (Department + membros ATIVOS + bloco no prompt + vínculo departmentId)
  // só é materializada quando o modo é 'roleta' OU 'departamentos'. Nos demais modos
  // o desired é VAZIO — isso desativa qualquer membro legado (tear-down de uma roleta
  // antiga ao trocar para solo/nenhum) e o agente NÃO recebe o bloco/vínculo de roleta.
  const isRoulette = handoff.mode === 'roleta' || handoff.mode === 'departamentos'

  // Sanitização + reconciliação delegadas ao helper PURO `team-reconcile`
  // (espelha o `pricing-reconcile`): dedupa o desired (last-write-wins),
  // normaliza o WhatsApp E.164-BR e reescreve `position` pela ordem do state.
  // Fora do modo roleta, o desired é vazio (desativa órfãos; não há roleta ativa).
  const desired = isRoulette
    ? sanitizeTeamMembersForRuntime(handoff.members)
    : []

  // 2. Upsert org-scoped do Department do projeto. Chave DETERMINÍSTICA = slug
  //    `team:${projectId}` (não há unique por name). `name`/`type` do state com
  //    defaults; `isActive:true`. Idempotente por @@unique([organizationId, slug]).
  const slug = `team:${ctx.projectId}`
  const name =
    handoff.departmentName && handoff.departmentName.trim().length > 0
      ? handoff.departmentName.trim()
      : 'Atendimento'
  const type =
    handoff.departmentType && handoff.departmentType.trim().length > 0
      ? handoff.departmentType.trim()
      : 'support'

  // B1b — mensagem de abertura do warm transfer (editável no card handoff_pairing).
  // Trim + clear-on-empty: apagar no Builder zera a coluna (runtime volta ao default).
  const warmTransferOpeningMessage = handoff.openingMessage?.trim() || null

  const department = await database.department.upsert({
    where: {
      organizationId_slug: { organizationId: ctx.organizationId, slug },
    },
    create: {
      organizationId: ctx.organizationId,
      name,
      slug,
      type,
      isActive: true,
      warmTransferOpeningMessage,
    },
    update: {
      name,
      type,
      isActive: true,
      warmTransferOpeningMessage,
    },
    select: { id: true },
  })

  // 3. Reconciliação dos membros DESTE departamento dentro de um $transaction
  //    (read-modify-reconcile em memória, igual ao pricing). Match-by-identity:
  //    - state ∩ DB  → update (name/whatsapp/userId/position, isActive:true)
  //    - state \ DB  → create
  //    - DB \ state  → update isActive:false (DESATIVA, nunca hard-delete)
  //    Escopo garantido por `departmentId` em TODO query. Acesso ao delegate via o
  //    MESMO guard de round-robin.service.ts — se ausente (migration não landou), o
  //    step degrada para no-op (NÃO lança; o department já foi criado).
  let upserted = 0
  let deactivated = 0
  await database.$transaction(async (tx) => {
    const delegate = getDepartmentMemberDelegate(tx)
    if (!delegate) {
      // Migration `department_member_whatsapp` ainda não landou — degrada para
      // no-op nos membros (o Department em si já existe). NÃO lança.
      console.warn(
        '[deploy/materialize_team] delegate departmentMember ausente — reconciliação de membros pulada (degradando)',
      )
      return
    }

    const existingRows = await delegate.findMany({
      where: { departmentId: department.id, organizationId: ctx.organizationId },
      select: {
        id: true,
        userId: true,
        whatsapp: true,
        name: true,
        isActive: true,
      },
    })
    const activeById = new Map(existingRows.map((r) => [r.id, r.isActive]))

    const plan = reconcileTeamMembers(
      existingRows.map((r) => ({
        id: r.id,
        userId: r.userId,
        whatsapp: r.whatsapp,
        name: r.name,
      })),
      desired,
    )

    // Guard de observabilidade: desired vazio desativa TODOS os membros ativos
    // (mesma semântica intencional do pricing). Acontece quando `state.handoff.members`
    // está vazio OU o modo NÃO é roleta/departamentos (tear-down de uma roleta antiga
    // ao trocar para solo/nenhum). Se vier de uma falha transitória de leitura do
    // builderState, a roleta foi zerada silenciosamente — loga em alto nível para não
    // confundir um deploy futuro (a reconciliação se recupera).
    if (desired.length === 0 && existingRows.some((r) => r.isActive)) {
      console.warn(
        `[deploy/materialize_team] desired vazio (handoff.members vazio ou modo '${handoff.mode ?? 'nenhum'}' não-roleta), ` +
          `mas o departamento tem membro(s) ativo(s) — TODOS serão desativados. ` +
          `Se for leitura transitória do state, a roleta foi zerada (re-deploy reconcilia).`,
      )
    }

    for (const member of plan.toUpdate) {
      await delegate.update({
        where: { id: member.id },
        data: {
          userId: member.userId,
          name: member.name,
          whatsapp: member.whatsapp,
          connectionId: member.connectionId,
          position: member.position,
          isActive: true,
        },
      })
      upserted += 1
    }
    for (const member of plan.toCreate) {
      await delegate.create({
        data: {
          organizationId: ctx.organizationId,
          departmentId: department.id,
          userId: member.userId,
          name: member.name,
          whatsapp: member.whatsapp,
          connectionId: member.connectionId,
          position: member.position,
          isActive: true,
        },
      })
      upserted += 1
    }
    // Desativa (nunca apaga) — só os que ainda estavam ativos (evita write no-op e
    // conta certo). `toDeactivate` já inclui dupes/órfãos legados.
    for (const id of plan.toDeactivate) {
      if (activeById.get(id) === false) continue
      await delegate.update({ where: { id }, data: { isActive: false } })
      deactivated += 1
    }
  })

  // 4. Liga o departamento ao agente pelo PROMPT (equivalente do priceListId do
  //    pricing, mas AIAgentConfig não tem coluna departmentId). Grava o bloco
  //    determinístico de roleta no systemPrompt entre marcadores — idempotente
  //    (substitui o bloco; se não houver, append). Org-scoped: o agente já foi
  //    validado como da org via o project no orchestrator; reconfirmamos no findFirst.
  //    VÍNCULO ESTRUTURADO (passo seguinte, neste mesmo `if`): o bloco no prompt é
  //    apenas um HINT redundante — pode ser sombreado por um AgentPromptVersion ACTIVE
  //    e nesse caso o departmentId não chega ao LLM. A fonte AUTORITATIVA do id passou
  //    a ser a coluna `AIAgentConfig.departmentId` (gravada logo abaixo), que o
  //    dispatch_to_agent lê via `ctx.agentDepartmentId` como FALLBACK — robusto a qual
  //    tabela de prompt vence.
  //
  //    Onda 2 — esse bloco + vínculo SÓ valem para modos de roleta ('roleta' /
  //    'departamentos'). Em 'solo'/'nenhum' o agente NÃO deve aprender a dispatchar
  //    para um setor: removemos um bloco de roleta legado do prompt (tear-down
  //    idempotente) e limpamos o vínculo departmentId QUANDO aponta para ESTE
  //    department (não clobbera um vínculo manual para outro setor).
  if (ctx.aiAgentId) {
    const agent = await database.aIAgentConfig.findFirst({
      where: { id: ctx.aiAgentId, organizationId: ctx.organizationId },
      select: {
        systemPrompt: true,
        departmentId: true,
        businessHours: true,
        enabledTools: true,
      },
    })
    if (agent) {
      // ATOMICIDADE: acumula todas as mudanças do agente num ÚNICO update — antes
      // eram 3-4 UPDATEs separados na mesma linha; uma falha no meio deixava estado
      // parcial (ex: prompt com bloco de roleta SEM o vínculo departmentId que o
      // dispatch usa como fallback). Continua idempotente: só inclui campo que mudou.
      const agentData: {
        systemPrompt?: string
        departmentId?: string | null
        businessHours?: Prisma.InputJsonValue
        enabledTools?: { set: string[] }
      } = {}

      if (isRoulette) {
        const block = buildRouletteBlock(department.id, name)
        const nextPrompt = applyRouletteBlock(agent.systemPrompt, block)
        if (nextPrompt !== (agent.systemPrompt ?? '')) {
          agentData.systemPrompt = nextPrompt
        }

        // Vínculo ESTRUTURADO (fonte AUTORITATIVA do id): grava o departamento na
        // coluna AIAgentConfig.departmentId. O dispatch_to_agent lê esta coluna como
        // FALLBACK quando o LLM não passa um departmentId válido — robusto a qual
        // tabela de prompt vence (o bloco acima pode ser sombreado por
        // AgentPromptVersion ACTIVE).
        if (agent.departmentId !== department.id) {
          agentData.departmentId = department.id
        }
      } else {
        // solo/nenhum — tear-down idempotente da roleta no agente:
        //  - remove um bloco de roleta legado do systemPrompt (se houver);
        //  - limpa o vínculo departmentId apenas quando aponta para ESTE department.
        const strippedPrompt = stripRouletteBlock(agent.systemPrompt)
        if (strippedPrompt !== (agent.systemPrompt ?? '')) {
          agentData.systemPrompt = strippedPrompt
        }
        if (agent.departmentId === department.id) {
          agentData.departmentId = null
        }
      }

      // Melhoria #2 — materializa o HORÁRIO COMERCIAL (agent-level) do builderState
      // para o runtime usá-lo no transfer_to_human (computeBusinessState → atendimento).
      // Só quando há `schedule` configurado; idempotente (compara JSON).
      if (state.hours?.schedule !== undefined) {
        const nextHours = {
          schedule: state.hours.schedule ?? null,
          timezone: state.hours.timezone ?? null,
          preset: state.hours.preset ?? null,
        }
        const currentHours =
          (agent as { businessHours?: unknown }).businessHours ?? null
        if (JSON.stringify(currentHours) !== JSON.stringify(nextHours)) {
          agentData.businessHours = nextHours as Prisma.InputJsonValue
        }
      }

      // FR-09/FR-10/FR-11 — DERIVA as tools do agente das decisões do usuário
      // (nunca re-decididas em outra superfície): handoff.mode → transfer_to_human
      // (+create_lead com roteiro); alsoSchedule + conexão REAL → tools de
      // calendário; sem conexão → fallback schedule_appointment. Set-merge
      // preserva tools custom; entra no MESMO update atômico acima.
      const calendarConnected = handoff.alsoSchedule
        ? await hasActiveCalendarConnection(ctx.organizationId, ctx.projectId)
        : false
      if (handoff.alsoSchedule && !calendarConnected) {
        console.warn(
          '[deploy/materialize_team] handoff.alsoSchedule sem conexão de agenda ativa — ' +
            'anexando schedule_appointment (registro de intenção) como FALLBACK. ' +
            'Conecte o Google Calendar e re-publique para habilitar as tools reais de agenda.',
        )
      }
      const tools = reconcileEnabledTools(agent.enabledTools, [
        deriveHandoffToolChanges({ mode: handoff.mode, steps: handoff.steps }),
        deriveCalendarToolChanges({
          alsoSchedule: handoff.alsoSchedule,
          hasActiveConnection: calendarConnected,
        }),
      ])
      if (tools.changed) {
        agentData.enabledTools = { set: tools.next }
      }

      if (Object.keys(agentData).length > 0) {
        await database.aIAgentConfig.update({
          where: { id: ctx.aiAgentId },
          data: agentData,
        })
      }
    }
  }

  return { departmentId: department.id, upserted, deactivated }
}

/**
 * compensateMaterializeTeam — compensação no rollback da saga.
 *
 * Fail-open e self-contained, IGUAL ao `compensateMaterializePricing`: o `ctx`
 * reconstruído pelo rollback handler NÃO carrega o bookkeeping desta run (ver
 * sagaContract §7), então a compensação NÃO pode depender de `ctx.state`. O
 * Department/membros refletem o que o USUÁRIO configurou (não é "lixo de deploy"),
 * então a compensação correta é um NO-OP idempotente: não desfazer a roleta (a
 * reconciliação roda de novo no próximo deploy). Nunca lança.
 */
export async function compensateMaterializeTeam(
  ctx: DeployContext,
): Promise<void> {
  // No-op idempotente: o departamento/membros são fonte de verdade do usuário e a
  // materialização é reversível pela própria reconciliação no próximo deploy.
  // `void ctx` evita lint de parâmetro não usado mantendo a assinatura do contrato.
  void ctx
}
