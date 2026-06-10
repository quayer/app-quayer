/**
 * materializePricing handler — step "materialize_pricing" da saga de deploy (M2).
 *
 * Materializa o PRICING coletado no `builderState` (Onda B) nos modelos de
 * RUNTIME (PriceList + PriceItem) para que a tool `get_pricing` fale o preço no
 * formato certo. Hoje a saga NÃO carrega o builderState; o pricing morre no JSONB.
 * Este step fecha isso: faz upsert org-scoped da PriceList `pricing:${projectId}`
 * (gravando os campos GLOBAIS novos: disclosureStyle / minTicketCents / currency),
 * liga `AIAgentConfig.priceListId` ao agente, e RECONCILIA os itens em memória
 * dentro de um `$transaction` (match-by-name lowercase: update / create /
 * deactivate — NUNCA hard-delete).
 *
 * FR-09/FR-10 (jornada-builder-v2): a tool `get_pricing` é DERIVADA aqui — itens
 * ativos + disclosureStyle!=='none' → garante `get_pricing` em
 * `AIAgentConfig.enabledTools`; 'none'/lista vazia → REMOVE `get_pricing` e
 * `send_pricing` (set-merge via `enabled-tools-derivation`, preserva tools
 * custom; mesmo UPDATE do priceListId — 1 escrita, idempotente).
 *
 * Folha da saga (sem editar nada existente além dos couplings do orchestrator/
 * contract/rollback, feitos em outra fatia). Carrega o builderState LAZY via
 * `readBuilderStateByProject` + `parseBuilderState` (fail-open: nunca lança no
 * caminho de read). PODE lançar em falha de DB de ESCRITA para acionar o rollback,
 * coerente com os outros steps.
 *
 * Toca tabelas:
 *   - PriceList     (UPSERT por @@unique([organizationId, name]))
 *   - AIAgentConfig (UPDATE priceListId)
 *   - PriceItem     (reconciliação: findMany + update/create/deactivate)
 *
 * REGRAS: TS strict, zero `any`; tudo org-scoped por `ctx.organizationId`;
 * idempotente (rodar 2x converge ao mesmo estado).
 */

import { database } from '@/server/services/database'
import { readBuilderStateByProject } from '../sources/builder-state-db'
import { parseBuilderState, type PricingState } from '../cards/builder-state'
import {
  sanitizePricingItemsForRuntime,
  reconcilePricingItems,
} from './pricing-reconcile'
import {
  derivePricingToolChanges,
  reconcileEnabledTools,
} from './enabled-tools-derivation'
import type { DeployContext } from './deploy.contract'

/** Estilos de divulgação válidos espelhando o card (G4). */
type DisclosureStyle = PricingState['disclosureStyle']

/** Resultado do step — payload descritivo (compatível com `runStep`). */
export interface MaterializePricingResult {
  listId: string
  upserted: number
  deactivated: number
}

/**
 * Re-clampa centavos defensivamente: inteiro >= 0 (o card já sanitiza, mas o step
 * re-valida — nunca confia no JSONB).
 */
function clampCents(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}

/**
 * Resolve `minTicketCents` GLOBAL: inteiro > 0 ou `null` (para "destravar" o
 * checkbox quando o usuário removeu o valor mínimo). 0/ausente => null.
 */
function resolveMinTicketCents(pricing: PricingState): number | null {
  if (typeof pricing.minTicketCents !== 'number') return null
  const cents = clampCents(pricing.minTicketCents)
  return cents > 0 ? cents : null
}

/** Normaliza a moeda para um código ISO-ish de 3 letras; default 'BRL'. */
function sanitizeCurrency(currency: string): string {
  const trimmed = currency.trim().toUpperCase()
  return trimmed.length === 3 ? trimmed : 'BRL'
}

/**
 * materializePricing — materializa o pricing do `builderState` nos modelos de
 * runtime. Idempotente e org-scoped.
 *
 * FAIL-OPEN no read do builderState: `readBuilderStateByProject` + `parseBuilderState`
 * nunca lançam (parseBuilderState backfilla para o default em qualquer falha), então
 * um state ausente/garbage resulta numa PriceList vazia e reconciliada (todos os
 * itens órfãos desativados) — degrada sem derrubar a saga.
 *
 * PODE lançar em falha de DB de ESCRITA (upsert da lista / update do agente /
 * transaction de itens) para acionar o rollback como os demais steps.
 */
export async function materializePricing(
  ctx: DeployContext,
): Promise<MaterializePricingResult> {
  // 1. Carrega o builderState LAZY (fail-open: nenhum desses lança).
  const state = parseBuilderState(await readBuilderStateByProject(ctx.projectId))
  const pricing = state.pricing

  const style: DisclosureStyle = pricing.disclosureStyle
  const currency = sanitizeCurrency(pricing.currency)
  const minTicketCents = resolveMinTicketCents(pricing)
  // Sanitização + reconciliação delegadas ao helper PURO `pricing-reconcile`:
  // dedupa o desired (last-write-wins) E trata duplicatas LEGADAS no DB
  // (convergência em 1 run, não 2). Aqui só fazemos a I/O do plano.
  const desired = sanitizePricingItemsForRuntime(pricing.items, style)

  // 2. Upsert org-scoped da PriceList do projeto, gravando os campos GLOBAIS novos
  //    (espelham o card). Idempotente por @@unique([organizationId, name]).
  const listName = `pricing:${ctx.projectId}`
  const list = await database.priceList.upsert({
    where: {
      organizationId_name: { organizationId: ctx.organizationId, name: listName },
    },
    create: {
      organizationId: ctx.organizationId,
      name: listName,
      description: 'Catálogo do projeto',
      currency,
      disclosureStyle: style,
      minTicketCents,
      isActive: true,
    },
    update: {
      currency,
      disclosureStyle: style,
      minTicketCents,
      isActive: true,
    },
    select: { id: true },
  })

  // 3. Liga a PriceList ao agente E DERIVA a tool `get_pricing` (FR-09/FR-10):
  //    itens ativos + disclosureStyle!=='none' → garante `get_pricing` em
  //    enabledTools; 'none'/lista vazia → REMOVE `get_pricing` e `send_pricing`
  //    (que ecoaria qualquer valor dito pelo LLM — perigosa sob "não falar
  //    preços"). O set-merge PRESERVA tools custom/desconhecidas. Tudo num
  //    ÚNICO update, só quando algo muda — idempotente. Org-scoped: o agente já
  //    foi validado como da org via o project no orchestrator; reconfirmado aqui.
  if (ctx.aiAgentId) {
    const agent = await database.aIAgentConfig.findFirst({
      where: { id: ctx.aiAgentId, organizationId: ctx.organizationId },
      select: { priceListId: true, enabledTools: true },
    })
    if (agent) {
      const agentData: {
        priceListId?: string
        enabledTools?: { set: string[] }
      } = {}
      if (agent.priceListId !== list.id) {
        agentData.priceListId = list.id
      }
      const tools = reconcileEnabledTools(agent.enabledTools, [
        derivePricingToolChanges({
          activeItemCount: desired.length,
          disclosureStyle: style,
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

  // 4. Reconciliação dos itens DESTA lista dentro de um $transaction (sem unique em
  //    (priceListId,name): read-modify-reconcile em memória). Match-by-name lowercase:
  //    - state ∩ DB  → update (preço/campos, isActive:true)
  //    - state \ DB  → create
  //    - DB \ state  → update isActive:false (DESATIVA, nunca hard-delete)
  //    Escopo garantido por `priceListId: list.id` em TODO query (nunca toca outras
  //    listas da org). Idempotente: 2x converge ao mesmo estado.
  let deactivated = 0
  await database.$transaction(async (tx) => {
    const existing = await tx.priceItem.findMany({
      where: { priceListId: list.id },
      select: { id: true, name: true, isActive: true },
    })
    const activeById = new Map(existing.map((r) => [r.id, r.isActive]))

    // Plano de reconciliação PURO (match-by-name lowercase; trata duplicatas
    // legadas via duplicateExistingIds → converge em 1 run).
    const plan = reconcilePricingItems(
      existing.map((r) => ({ id: r.id, name: r.name })),
      desired,
    )

    for (const item of plan.toUpdate) {
      await tx.priceItem.update({
        where: { id: item.id },
        data: {
          name: item.name,
          priceCents: item.priceCents,
          priceMaxCents: item.priceMaxCents,
          imageUrl: item.imageUrl,
          category: item.category,
          isActive: true,
        },
      })
    }
    for (const item of plan.toCreate) {
      await tx.priceItem.create({
        data: {
          priceListId: list.id,
          name: item.name,
          priceCents: item.priceCents,
          priceMaxCents: item.priceMaxCents,
          imageUrl: item.imageUrl,
          category: item.category,
          isActive: true,
        },
      })
    }
    // Desativa (nunca apaga) — só os que ainda estavam ativos (evita write no-op e
    // conta certo). `toDeactivate` já inclui as duplicatas legadas.
    for (const id of plan.toDeactivate) {
      if (activeById.get(id) === false) continue
      await tx.priceItem.update({ where: { id }, data: { isActive: false } })
      deactivated += 1
    }
  })

  return { listId: list.id, upserted: desired.length, deactivated }
}

/**
 * compensateMaterializePricing — compensação no rollback da saga.
 *
 * Fail-open e self-contained: o `ctx` reconstruído pelo rollback handler NÃO carrega
 * o bookkeeping desta run (ver sagaContract §7), então a compensação NÃO pode depender
 * de `ctx.state`. O pricing materializado reflete o que o USUÁRIO configurou (não é
 * "lixo de deploy"), então a compensação correta é um NO-OP idempotente: não reabrir o
 * catálogo (a reconciliação roda de novo no próximo deploy). Nunca lança.
 */
export async function compensateMaterializePricing(
  ctx: DeployContext,
): Promise<void> {
  // No-op idempotente: o catálogo é fonte de verdade do usuário e a materialização é
  // reversível pela própria reconciliação no próximo deploy. `void ctx` evita lint de
  // parâmetro não usado mantendo a assinatura do contrato de compensação.
  void ctx
}
