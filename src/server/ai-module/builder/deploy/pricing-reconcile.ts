/**
 * Builder Module — Pricing reconciliation (M2, materialização do PRICING)
 *
 * Helper PURO (zero IO, zero `any`) que decide o que CRIAR, ATUALIZAR e DESATIVAR
 * na PriceList do projeto/agente quando o deploy materializa o `builderState.pricing`
 * (Onda B) nos modelos de runtime (PriceList/PriceItem). Toda a regra de
 * reconciliação vive aqui, isolada de DB/Prisma, para ser testável unitariamente.
 *
 * Por que aqui (e não inline no step da saga):
 *  - NÃO há unique `(priceListId, name)` no schema (a migration de M2 não criou).
 *    Logo a materialização é um read-modify-reconcile EM MEMÓRIA: o step lê os itens
 *    atuais do DB, chama `reconcilePricingItems(existing, desired)` e aplica o plano
 *    num `$transaction`. Esta função é o "modify" puro do meio.
 *  - A reconciliação por NOME (case-insensitive) NUNCA hard-deleta: itens que
 *    sumiram do builderState entram em `toDeactivate` (isActive=false) — preserva
 *    histórico e é reversível. Itens novos entram em `toCreate`; os que continuam,
 *    em `toUpdate` (reativando, já que `isActive:true` faz parte do payload).
 *  - Idempotência: rodar 2x converge ao mesmo estado (update no-op + reativação dos
 *    mesmos itens). Seguro para retry pós-crash, coerente com os outros steps.
 *
 * `sanitizePricingItemsForRuntime` espelha `sanitizePricingItems` de
 * `cards/handlers/apply-card-submit.ts` (mesma fonte canônica de regra): trim do
 * nome, clamp de centavos para inteiro >= 0, e condiciona os campos novos da Onda B
 * ao estilo de divulgação global (`priceMaxCents` só sobrevive em 'average' E
 * estritamente > piso; `imageUrl` só se https válido). A diferença é o SHAPE de
 * saída: aqui produzimos o `NormalizedItem` pronto para o DB, com `priceMaxCents`,
 * `imageUrl` e `category` como `number | string | null` (`null` = "limpar a coluna"
 * quando o usuário removeu o valor), em vez de campos opcionais omitidos do JSONB.
 *
 * Dependency-free: apenas tipos do builder-state. No DB, no IO, no `any`.
 */

import type { PricingItem } from '../cards/builder-state'

// ==========================================
// Tipos públicos
// ==========================================

/** Estilo GLOBAL de como o agente FALA o preço (espelho do card/builder-state). */
export type PricingDisclosureStyle = 'exact' | 'from' | 'average' | 'none'

/**
 * Um item de preço JÁ NORMALIZADO e pronto para virar linha de PriceItem.
 *
 * Campos nuláveis usam `null` (não `undefined`) DE PROPÓSITO: no `update` o `null`
 * instrui o Prisma a LIMPAR a coluna (ex.: o usuário removeu a foto/categoria/teto),
 * enquanto `undefined` deixaria o valor antigo — semântica errada para um catálogo
 * submetido wholesale. `priceCents` é sempre um inteiro >= 0.
 */
export interface NormalizedItem {
  name: string
  priceCents: number
  /** Teto da faixa (só presente quando style==='average' E > piso); senão null. */
  priceMaxCents: number | null
  /** URL https da foto do item; null quando ausente/inválida. */
  imageUrl: string | null
  /** Categoria livre; null quando ausente/vazia. */
  category: string | null
}

/** Linha mínima que a reconciliação precisa do DB: id + name (case-insensitive). */
export interface ExistingPriceItem {
  id: string
  name: string
}

/** Um `NormalizedItem` carimbado com o id da linha existente a atualizar. */
export type PriceItemUpdate = NormalizedItem & { id: string }

/**
 * Plano de reconciliação consumido pelo step `materialize_pricing`:
 *  - `toCreate`     → itens novos (presentes no state, ausentes no DB).
 *  - `toUpdate`     → itens que continuam (presentes em ambos); reativa + reescreve.
 *  - `toDeactivate` → ids de itens que sumiram do state (DESATIVA, nunca deleta).
 */
export interface PricingReconcilePlan {
  toCreate: NormalizedItem[]
  toUpdate: PriceItemUpdate[]
  toDeactivate: string[]
}

// ==========================================
// Internos (espelham apply-card-submit.ts)
// ==========================================

/** `true` quando uma URL http(s) é confiável o suficiente para persistir (G5b). */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

/** Chave canônica de reconciliação por nome: trim + lowercase (case-insensitive). */
function nameKey(name: string): string {
  return name.trim().toLowerCase()
}

// ==========================================
// sanitizePricingItemsForRuntime
// ==========================================

/**
 * Re-valida os itens do `builderState.pricing` para o SHAPE de runtime, espelhando
 * `sanitizePricingItems` do handler de card-submit (mesma regra canônica), mas
 * produzindo `NormalizedItem` (campos nuláveis com `null`) em vez de omitir campos.
 *
 * Regras (defensivas — o card já sanitiza, o step re-valida; nunca confia no JSONB):
 *  - `name` trimado; itens com nome vazio são DESCARTADOS.
 *  - `priceCents` → `Math.max(0, Math.trunc(...))` (inteiro >= 0; sem float drift).
 *  - `priceMaxCents` só sobrevive quando `style==='average'` E o teto (truncado,
 *    >= 0) é ESTRITAMENTE maior que o piso; caso contrário vira `null`. Nunca
 *    inventa teto.
 *  - `imageUrl` só sobrevive como string https válida (trim + cap 2000); senão `null`.
 *  - `category` trimada; vazia vira `null`.
 *
 * Função pura: não lê DB, não muta o input, sem `any`.
 */
export function sanitizePricingItemsForRuntime(
  items: readonly PricingItem[],
  disclosureStyle: PricingDisclosureStyle,
): NormalizedItem[] {
  const out: NormalizedItem[] = []
  for (const item of items) {
    const name = item.name.trim()
    if (name.length === 0) continue

    // priceCents já é int>=0 via Zod no card; clampa defensivamente mesmo assim.
    const priceCents = Math.max(0, Math.trunc(item.priceCents))

    // G4 — teto da faixa: só em 'average' E max > piso. Senão null (limpa a coluna).
    let priceMaxCents: number | null = null
    if (
      disclosureStyle === 'average' &&
      typeof item.priceMaxCents === 'number'
    ) {
      const ceiling = Math.max(0, Math.trunc(item.priceMaxCents))
      if (ceiling > priceCents) priceMaxCents = ceiling
    }

    // G5b — foto do serviço: só uma URL http(s) válida (trim + cap 2000); senão null.
    let imageUrl: string | null = null
    if (typeof item.imageUrl === 'string') {
      const trimmed = item.imageUrl.trim().slice(0, 2000)
      if (trimmed.length > 0 && isHttpUrl(trimmed)) imageUrl = trimmed
    }

    const trimmedCategory = item.category?.trim()
    const category =
      trimmedCategory && trimmedCategory.length > 0 ? trimmedCategory : null

    out.push({ name, priceCents, priceMaxCents, imageUrl, category })
  }
  return out
}

// ==========================================
// reconcilePricingItems
// ==========================================

/**
 * Calcula o plano de reconciliação por NOME (case-insensitive) entre o que o DB
 * tem hoje (`existing`) e os itens normalizados do builderState (`desired`).
 *
 * Match-by-name (chave = `name.trim().toLowerCase()`):
 *  - presente em `desired` E no DB → `toUpdate` (carimba o id; o step reescreve
 *    preço/teto/foto/categoria e reativa `isActive:true`).
 *  - presente em `desired`, ausente no DB → `toCreate` (linha nova).
 *  - presente no DB, ausente em `desired` → `toDeactivate` (id; isActive=false,
 *    NUNCA hard-delete — preserva histórico/reversível).
 *
 * Detalhes que garantem idempotência e robustez:
 *  - Se o builderState tiver DOIS itens que colidem na mesma chave (ex.: "Corte" e
 *    "corte"), o ÚLTIMO vence (last-write-wins) e os anteriores são descartados —
 *    o catálogo de runtime nunca fica com duplicatas por nome.
 *  - Se o DB tiver duplicatas históricas com a mesma chave, o PRIMEIRO id é o alvo
 *    do update e os demais entram em `toDeactivate` (converge para 1 ativo por nome).
 *  - `existing` é tratado como `{ id, name }[]` (o step seleciona só isso). O escopo
 *    de "qual PriceList" é responsabilidade do CALLER (o step filtra por priceListId);
 *    esta função é agnóstica de org/list — só reconcilia as duas listas que recebe.
 *
 * Função pura: não muta os inputs, sem `any`.
 */
export function reconcilePricingItems(
  existing: readonly ExistingPriceItem[],
  desired: readonly NormalizedItem[],
): PricingReconcilePlan {
  // Index do estado desejado por chave (last-write-wins em colisões de nome).
  const desiredByKey = new Map<string, NormalizedItem>()
  for (const item of desired) {
    desiredByKey.set(nameKey(item.name), item)
  }

  // Index do DB por chave: primeiro id por chave vira o "alvo"; ids extras (dupes)
  // são coletados para desativação independentemente de estarem ou não no desired.
  const existingTargetByKey = new Map<string, string>()
  const duplicateExistingIds: string[] = []
  for (const row of existing) {
    const key = nameKey(row.name)
    if (existingTargetByKey.has(key)) {
      // Já há um alvo para esta chave — esta linha é uma duplicata histórica.
      duplicateExistingIds.push(row.id)
    } else {
      existingTargetByKey.set(key, row.id)
    }
  }

  const toCreate: NormalizedItem[] = []
  const toUpdate: PriceItemUpdate[] = []
  const toDeactivate: string[] = [...duplicateExistingIds]

  // Itens desejados: update quando há alvo no DB, create caso contrário.
  for (const [key, item] of desiredByKey) {
    const targetId = existingTargetByKey.get(key)
    if (targetId !== undefined) {
      toUpdate.push({ id: targetId, ...item })
    } else {
      toCreate.push(item)
    }
  }

  // Itens do DB (alvos) que sumiram do desired → desativar (nunca deletar).
  for (const [key, id] of existingTargetByKey) {
    if (!desiredByKey.has(key)) {
      toDeactivate.push(id)
    }
  }

  return { toCreate, toUpdate, toDeactivate }
}
