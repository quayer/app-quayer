/**
 * Builder Cards — prefill por exceção (Jornada v2 · T39, FR-02 + FR-23)
 *
 * Helper PURO (sem React, sem IO, sem `any`) que materializa a regra ÚNICA de
 * pré-preenchimento dos cards da jornada v2:
 *
 *     owned confirmado  >  capturedProposals.<domínio>  >  default
 *
 * "owned confirmado" = o valor já vive no slice canônico do BuilderState porque
 * o usuário confirmou o card daquele domínio (sentinel true). "capturedProposals"
 * = valor PROPOSTO pela conversa (tool `propose_field_values`/nicho regulado) que
 * NUNCA flipou sentinel — entra como sugestão e ganha o badge "sugerido da
 * conversa". "default" = o que o componente passa quando não há nem owned nem
 * proposta (ex.: "sempre aberto" nos horários — o default vive no COMPONENTE, não
 * aqui; este helper só resolve a precedência owned/proposta).
 *
 * Cada campo resolvido carrega a ORIGEM (`'owned' | 'proposed' | 'default'`) para
 * o componente decidir o badge: só `'proposed'` mostra "sugerido da conversa".
 *
 * --- Proposta tardia (FR-23) ---
 * A precedência acima é calculada UMA ÚNICA VEZ, no mount do card (o componente
 * congela o resultado em `useState`/`useMemo[]`). Uma proposta que CHEGA DEPOIS
 * (refetch do readiness durante a conversa) NÃO pode re-prefillar nem sobrescrever
 * o que o usuário digitou. Este arquivo só expõe a DETECÇÃO dessa proposta tardia
 * ({@link detectLateProposals}): compara o snapshot congelado no mount com o
 * estado vivo e reporta, por domínio, quais propostas novas existem. Quem AGE com
 * isso é o chip "Usar sugestão" (T95) — aplicar é ação explícita do usuário; este
 * helper jamais escreve nada de volta.
 *
 * Os `capturedProposals` chegam de graça no `builderState` que o readiness já
 * entrega (NFR-05: zero fetch extra) — `value.capturedProposals`.
 *
 * Contract: plan §4.2 (specs/jornada-builder-v2/plan.md).
 */

import type {
  BuilderState,
  CapturedProposals,
} from "@/server/ai-module/builder/cards/builder-state"

/**
 * De onde veio o valor pré-preenchido de UM campo:
 *  - `owned`    — confirmado pelo usuário (slice canônico do state); SEM badge.
 *  - `proposed` — sugerido pela conversa (`capturedProposals`); badge "sugerido
 *                 da conversa".
 *  - `default`  — nem owned nem proposta; o componente aplica seu próprio default.
 */
export type PrefillOrigin = "owned" | "proposed" | "default"

/** Um campo resolvido: o valor a montar + a origem (para o badge). */
export interface PrefilledField<T> {
  value: T
  origin: PrefillOrigin
}

/**
 * Resolve UM campo pela precedência `owned > proposed > default`.
 *
 * `owned`/`proposed` são tratados como "presentes" só quando NÃO são
 * `undefined` — assim um campo owned vazio-mas-confirmado (string `""`) ainda
 * vence a proposta, fiel ao "configure por exceção" (o usuário já decidiu, mesmo
 * que para deixar em branco). Strings são consideradas presentes mesmo vazias;
 * cabe ao componente decidir o que é "vazio" para fins de UI.
 *
 * Puro: nunca muta entradas, sempre devolve um novo {@link PrefilledField}.
 */
export function resolveField<T>(args: {
  owned: T | undefined
  proposed: T | undefined
  fallback: T
}): PrefilledField<T> {
  if (args.owned !== undefined) {
    return { value: args.owned, origin: "owned" }
  }
  if (args.proposed !== undefined) {
    return { value: args.proposed, origin: "proposed" }
  }
  return { value: args.fallback, origin: "default" }
}

/**
 * Domínios que carregam proposta capturada — a WHITELIST estrutural do
 * `capturedProposals` (espelha as chaves do schema server-side). Usado pela
 * detecção de proposta tardia para iterar só os domínios conhecidos.
 */
export type PrefillDomain = keyof CapturedProposals

const PREFILL_DOMAINS: readonly PrefillDomain[] = [
  "persona",
  "services",
  "hours",
  "pricing",
  "handoff",
  "activation",
] as const

/**
 * Lê com segurança a proposta de um domínio do state vivo. Sempre devolve
 * `undefined` quando o namespace/domínio está ausente — o `capturedProposals` é
 * opcional no top-level (states legados parseiam para `undefined`).
 */
export function readProposal<D extends PrefillDomain>(
  state: Pick<BuilderState, "capturedProposals">,
  domain: D,
): NonNullable<CapturedProposals[D]> | undefined {
  return state.capturedProposals?.[domain] ?? undefined
}

/**
 * Snapshot, congelado no MOUNT do card, das propostas que JÁ tinham entrado no
 * prefill inicial. {@link detectLateProposals} compara o vivo contra isto para
 * achar só o que chegou DEPOIS. Construído por {@link captureProposalSnapshot}.
 *
 * É um mapa domínio → proposta serializada (JSON estável). Guardar o JSON (e não
 * a referência) deixa a comparação imune a novas referências de objeto vindas de
 * um refetch que não mudou o conteúdo.
 */
export type ProposalSnapshot = Readonly<Record<PrefillDomain, string | null>>

/**
 * Serializa a proposta de cada domínio no MOUNT. O componente guarda o retorno
 * (ref estável, ex.: `useRef`/`useMemo[]`) e passa de volta a
 * {@link detectLateProposals} a cada readiness vivo.
 *
 * `null` = nenhuma proposta naquele domínio no mount (importante: distingue
 * "não havia nada" de "havia algo" para a detecção tardia).
 */
export function captureProposalSnapshot(
  state: Pick<BuilderState, "capturedProposals">,
): ProposalSnapshot {
  const snapshot = {} as Record<PrefillDomain, string | null>
  for (const domain of PREFILL_DOMAINS) {
    const proposal = readProposal(state, domain)
    snapshot[domain] = proposal === undefined ? null : stableStringify(proposal)
  }
  return snapshot
}

/**
 * Uma proposta TARDIA detectada: chegou (ou mudou) DEPOIS do mount, para um
 * domínio cujo campo já está montado. É o insumo do chip "Usar sugestão" (T95) —
 * `value` é a proposta atual do domínio (tipada pelo schema), pronta para o chip
 * oferecer ao usuário. NUNCA é aplicada automaticamente.
 */
export interface LateProposal<D extends PrefillDomain = PrefillDomain> {
  domain: D
  value: NonNullable<CapturedProposals[D]>
}

/**
 * FR-23 — Detecta propostas que chegaram DEPOIS do mount comparando o estado
 * VIVO contra o {@link ProposalSnapshot} congelado. Devolve só os domínios cuja
 * proposta viva difere do snapshot (apareceu do nada OU mudou de conteúdo).
 *
 * Esta função SÓ DETECTA. Ela não re-prefilla, não sobrescreve digitação e não
 * escreve nada no state — é leitura pura. O componente decide se mostra o chip
 * "Usar sugestão" e o usuário decide se aplica (T95).
 *
 * Importante (não re-prefillar o campo montado): a comparação é por CONTEÚDO
 * (JSON estável), então um refetch que devolve a MESMA proposta (nova referência
 * de objeto, mesmo conteúdo) NÃO dispara — só conteúdo genuinamente novo entra na
 * lista. Propostas que sumiram (vivas → ausentes) também NÃO entram: nada a
 * sugerir, o campo montado permanece intocado.
 *
 * Puro: nunca muta entradas.
 */
export function detectLateProposals(
  liveState: Pick<BuilderState, "capturedProposals">,
  mountSnapshot: ProposalSnapshot,
): LateProposal[] {
  const late: LateProposal[] = []
  for (const domain of PREFILL_DOMAINS) {
    const liveProposal = readProposal(liveState, domain)
    if (liveProposal === undefined) continue // sumiu/nunca houve → nada a sugerir
    const liveSerialized = stableStringify(liveProposal)
    if (liveSerialized === mountSnapshot[domain]) continue // inalterada desde o mount
    // Conteúdo novo ou alterado desde o mount → candidato a chip "Usar sugestão".
    late.push({ domain, value: liveProposal })
  }
  return late
}

/**
 * Stringify determinístico (chaves ordenadas) para comparar propostas por
 * conteúdo, imune à ordem de chaves e a novas referências de um refetch. Cobre o
 * shape do `capturedProposals` (objetos aninhados rasos + arrays de string/itens
 * de preço); não há ciclos no JSONB do state, então a recursão simples basta.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const record = val as Record<string, unknown>
      return Object.keys(record)
        .sort()
        .reduce<Record<string, unknown>>((sorted, key) => {
          sorted[key] = record[key]
          return sorted
        }, {})
    }
    return val
  })
}
