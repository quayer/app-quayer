/**
 * Builder Module — Team reconciliation (M1, materialização do TEAM)
 *
 * Helper PURO (zero IO, zero `any`) que decide o que CRIAR, ATUALIZAR e DESATIVAR
 * nos `DepartmentMember` do projeto/agente quando o deploy materializa o
 * `builderState.team` (Onda A, card team_structure) nos modelos de runtime
 * (Department/DepartmentMember). Toda a regra de reconciliação vive aqui, isolada
 * de DB/Prisma, para ser testável unitariamente. Espelho EXATO de
 * `pricing-reconcile.ts` (M2) — mesma forma, mesma garantia de idempotência.
 *
 * Por que aqui (e não inline no step da saga):
 *  - O `@@unique([departmentId, userId])` SÓ cobre membros-USUÁRIO; no Postgres
 *    vários `userId = NULL` são DISTINTOS, então membros "nome + WhatsApp" (sem
 *    userId) NÃO têm unique e exigem reconcile manual. Logo a materialização é um
 *    read-modify-reconcile EM MEMÓRIA: o step lê os membros atuais do DB, chama
 *    `reconcileTeamMembers(existing, desired)` e aplica o plano num `$transaction`.
 *    Esta função é o "modify" puro do meio.
 *  - A reconciliação NUNCA hard-deleta: membros que sumiram do builderState entram
 *    em `toDeactivate` (isActive=false) — preserva histórico, é reversível e nunca
 *    quebra FKs (o cursor da roleta pode ainda apontar pra eles). Membros novos
 *    entram em `toCreate`; os que continuam, em `toUpdate` (reativando, já que
 *    `isActive:true` faz parte do payload do step).
 *  - Idempotência: rodar 2x converge ao mesmo estado (update no-op + reativação dos
 *    mesmos membros). Seguro para retry pós-crash, coerente com os outros steps.
 *
 * CHAVE de match (3 níveis, NESTA ordem de preferência):
 *  1. `userId` quando AMBOS os lados têm userId (membro-usuário canônico).
 *  2. senão `whatsapp` normalizado (membro "nome + WhatsApp" não-usuário).
 *  3. senão `nome` normalizado (trim + lowercase) — último recurso (legado só-nome).
 *
 * `sanitizeTeamMembersForRuntime` espelha `sanitizeTeamMembers` de
 * `cards/handlers/apply-card-submit.ts` (mesma fonte canônica de regra): trim do
 * `name`, normalização do `whatsapp` para E.164-BR via uma porta SERVER-SIDE de
 * `normalizeWhatsappBr` (paridade EXATA), e `position` reescrita pela ORDEM do state
 * (0..N) em vez de confiar no campo do JSONB. A diferença é o SHAPE de saída: aqui
 * produzimos o `NormalizedMember` pronto para o DB, com `userId`/`name`/`whatsapp`
 * como `string | null` (`null` = "limpar/ausente"), em vez de campos omitidos.
 * Linhas sem NENHUM identificador (userId OU whatsapp OU name) são DESCARTADAS.
 *
 * Dependency-free: apenas o tipo `TeamMember` do builder-state. No DB, no IO, no `any`.
 */

import type { TeamMember } from '../cards/builder-state'

// ==========================================
// Tipos públicos
// ==========================================

/**
 * Um membro do time JÁ NORMALIZADO e pronto para virar linha de DepartmentMember.
 *
 * Campos nuláveis usam `null` (não `undefined`) DE PROPÓSITO: no `update` o `null`
 * instrui o Prisma a LIMPAR a coluna (ex.: o usuário tirou o WhatsApp/userId),
 * enquanto `undefined` deixaria o valor antigo — semântica errada para um time
 * submetido wholesale. `position` é sempre um inteiro >= 0 ditado pela ORDEM.
 */
export interface NormalizedMember {
  /** userId do usuário-membro; null quando é um membro "nome + WhatsApp". */
  userId: string | null
  /** Nome livre do membro; null quando ausente/vazio. */
  name: string | null
  /** WhatsApp E.164-BR (`+55DDDNNNNNNNN`); null quando ausente/inválido. */
  whatsapp: string | null
  /** F0 — Connection.id da instância própria do membro (warm transfer); null quando ausente. */
  connectionId: string | null
  /** Ordem 0..N no rodízio, reescrita pela posição no array do state. */
  position: number
}

/** Linha mínima que a reconciliação precisa do DB (escopo de departmentId é do caller). */
export interface ExistingMember {
  id: string
  userId: string | null
  whatsapp: string | null
  name: string | null
}

/** Um `NormalizedMember` carimbado com o id da linha existente a atualizar. */
export type MemberUpdate = NormalizedMember & { id: string }

/**
 * Plano de reconciliação consumido pelo step `materialize_team`:
 *  - `toCreate`     → membros novos (presentes no state, ausentes no DB).
 *  - `toUpdate`     → membros que continuam (presentes em ambos); reativa + reescreve.
 *  - `toDeactivate` → ids de membros que sumiram do state (DESATIVA, nunca deleta).
 */
export interface TeamReconcilePlan {
  toCreate: NormalizedMember[]
  toUpdate: MemberUpdate[]
  toDeactivate: string[]
}

// ==========================================
// Internos (espelham apply-card-submit.ts)
// ==========================================

/**
 * Porta SERVER-SIDE de `normalizeWhatsappBr` (apply-card-submit.ts) — paridade
 * EXATA: normaliza um telefone brasileiro digitado livre para E.164
 * (`+55DDDNNNNNNNN`) SEM depender de DOM e SEM IO. Só retorna um número quando há
 * confiança na forma (mesma regex `^\+\d{10,15}$` que o FE/handler); caso contrário
 * `null` — o WhatsApp é OPCIONAL, então simplesmente o limpamos. Replicado aqui
 * (em vez de importado) para manter este helper dependency-free, igual ao
 * `isHttpUrl`/`nameKey` privados do pricing-reconcile.
 */
function normalizeWhatsappBr(raw: string | undefined | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null

  let candidate: string | null = null
  // Já vem com DDI 55 (12 dígitos = fixo, 13 = celular com 9).
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    candidate = `+${digits}`
  } else if (digits.length === 10 || digits.length === 11) {
    // Local com DDD: 10 (fixo) ou 11 (celular com 9) — assume Brasil.
    candidate = `+55${digits}`
  } else if (raw.startsWith('+') && digits.length >= 10 && digits.length <= 15) {
    // Estrangeiro / já prefixado com `+` — repassa se o tamanho for plausível.
    candidate = `+${digits}`
  }

  // Valida a forma final igual ao FE/handler (isValidBrE164) antes de confiar nela.
  if (candidate !== null && /^\+\d{10,15}$/.test(candidate)) return candidate
  return null
}

/** Chave canônica de reconciliação por nome: trim + lowercase (case-insensitive). */
function nameKey(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Chave de match de um membro segundo a precedência 3-níveis (userId > whatsapp >
 * name). Retorna `null` quando o membro não tem NENHUM identificador (caso já
 * descartado em `sanitizeTeamMembersForRuntime`, mas defensivo aqui também).
 * O prefixo evita colisão acidental entre níveis (um userId nunca casa um número).
 */
function matchKeyFromParts(
  userId: string | null,
  whatsapp: string | null,
  name: string | null,
): string | null {
  if (userId !== null) return `u:${userId}`
  if (whatsapp !== null) return `w:${whatsapp}`
  if (name !== null) {
    const key = nameKey(name)
    if (key.length > 0) return `n:${key}`
  }
  return null
}

// ==========================================
// sanitizeTeamMembersForRuntime
// ==========================================

/**
 * Re-valida os membros do `builderState.team` para o SHAPE de runtime, espelhando
 * `sanitizeTeamMembers` do handler de card-submit (mesma regra canônica), mas
 * produzindo `NormalizedMember` (campos nuláveis com `null`) em vez de omitir campos.
 *
 * Regras (defensivas — o card já sanitiza, o step re-valida; nunca confia no JSONB):
 *  - `name` trimado; vazio vira `null`.
 *  - `whatsapp` normalizado para E.164-BR (`normalizeWhatsappBr`); inválido vira `null`.
 *  - `userId` trimado; vazio vira `null`.
 *  - Linhas SEM NENHUM identificador (userId E whatsapp E name todos null) são
 *    DESCARTADAS (uma linha vazia não vira membro fantasma).
 *  - `position` REESCRITA pela ORDEM (0..N) dos membros sobreviventes — o índice do
 *    JSONB é ignorado (deduplicação/descarte poderia deixar buracos). Determinístico.
 *
 * Função pura: não lê DB, não muta o input, sem `any`.
 */
export function sanitizeTeamMembersForRuntime(
  members: readonly TeamMember[],
): NormalizedMember[] {
  const out: NormalizedMember[] = []
  for (const member of members) {
    const trimmedUserId = member.userId?.trim()
    const userId =
      trimmedUserId && trimmedUserId.length > 0 ? trimmedUserId : null

    const trimmedName = member.name?.trim()
    const name = trimmedName && trimmedName.length > 0 ? trimmedName : null

    const whatsapp = normalizeWhatsappBr(member.whatsapp)

    // Linha sem identificador algum não vira membro (evita fantasma no rodízio).
    if (userId === null && whatsapp === null && name === null) continue

    // F0 — connectionId só transita (string|null); o runtime valida tenant-scoped.
    const trimmedConnId = member.connectionId?.trim()
    const connectionId =
      trimmedConnId && trimmedConnId.length > 0 ? trimmedConnId : null

    // `position` pela ORDEM dos sobreviventes (0..N), não pelo campo do JSONB.
    out.push({ userId, name, whatsapp, connectionId, position: out.length })
  }
  return out
}

// ==========================================
// reconcileTeamMembers
// ==========================================

/**
 * Calcula o plano de reconciliação entre o que o DB tem hoje (`existing`) e os
 * membros normalizados do builderState (`desired`), pela CHAVE 3-níveis
 * (userId > whatsapp normalizado > nome normalizado), nesta ordem de preferência.
 *
 * Match-by-key:
 *  - presente em `desired` E no DB → `toUpdate` (carimba o id; o step reescreve
 *    userId/name/whatsapp/position e reativa `isActive:true`).
 *  - presente em `desired`, ausente no DB → `toCreate` (linha nova).
 *  - presente no DB, ausente em `desired` → `toDeactivate` (id; isActive=false,
 *    NUNCA hard-delete — preserva histórico/reversível, não quebra o cursor da roleta).
 *
 * Detalhes que garantem idempotência e robustez (IDÊNTICOS ao pricing-reconcile):
 *  - Se o `desired` tiver DOIS membros que colidem na mesma chave, o ÚLTIMO vence
 *    (last-write-wins) e os anteriores são descartados — o runtime nunca fica com
 *    duplicatas por chave.
 *  - Se o DB tiver duplicatas históricas com a mesma chave, o PRIMEIRO id é o alvo
 *    do update e os demais entram em `toDeactivate` (converge para 1 ativo por chave
 *    em UM run, não dois).
 *  - O `existing` do DB é normalizado pela MESMA porta (`normalizeWhatsappBr`) antes
 *    de chavear, para que um WhatsApp gravado em formato diferente case o desired.
 *  - O escopo ("qual departmentId") é responsabilidade do CALLER (o step filtra por
 *    departmentId no findMany); esta função é agnóstica de org/dept — só reconcilia
 *    as duas listas que recebe.
 *
 * Função pura: não muta os inputs, sem `any`.
 */
export function reconcileTeamMembers(
  existing: readonly ExistingMember[],
  desired: readonly NormalizedMember[],
): TeamReconcilePlan {
  // Index do estado desejado por chave (last-write-wins em colisões de chave).
  // Linhas sem chave (já descartadas no sanitize) são ignoradas defensivamente.
  const desiredByKey = new Map<string, NormalizedMember>()
  for (const member of desired) {
    const key = matchKeyFromParts(member.userId, member.whatsapp, member.name)
    if (key === null) continue
    desiredByKey.set(key, member)
  }

  // Index do DB por chave: primeiro id por chave vira o "alvo"; ids extras (dupes)
  // são coletados para desativação. Linhas sem chave alguma (lixo legado) entram
  // direto em toDeactivate — não há como reconciliá-las, mas não se apaga.
  const existingTargetByKey = new Map<string, string>()
  const duplicateExistingIds: string[] = []
  for (const row of existing) {
    const key = matchKeyFromParts(
      row.userId !== null && row.userId.length > 0 ? row.userId : null,
      normalizeWhatsappBr(row.whatsapp),
      row.name !== null && row.name.length > 0 ? row.name : null,
    )
    if (key === null) {
      // Membro DB sem identificador algum: não dá pra casar — desativa (nunca apaga).
      duplicateExistingIds.push(row.id)
      continue
    }
    if (existingTargetByKey.has(key)) {
      // Já há um alvo para esta chave — esta linha é uma duplicata histórica.
      duplicateExistingIds.push(row.id)
    } else {
      existingTargetByKey.set(key, row.id)
    }
  }

  const toCreate: NormalizedMember[] = []
  const toUpdate: MemberUpdate[] = []
  const toDeactivate: string[] = [...duplicateExistingIds]

  // Membros desejados: update quando há alvo no DB, create caso contrário.
  for (const [key, member] of desiredByKey) {
    const targetId = existingTargetByKey.get(key)
    if (targetId !== undefined) {
      toUpdate.push({ id: targetId, ...member })
    } else {
      toCreate.push(member)
    }
  }

  // Membros do DB (alvos) que sumiram do desired → desativar (nunca deletar).
  for (const [key, id] of existingTargetByKey) {
    if (!desiredByKey.has(key)) {
      toDeactivate.push(id)
    }
  }

  return { toCreate, toUpdate, toDeactivate }
}
