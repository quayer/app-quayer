/**
 * Builder Module — Inferência de nicho / risco — NÚCLEO PURO (client-safe)
 *
 * Estes helpers eram PRIVADOS em `playbook/designer-input.ts`. A spec v3
 * (`specs/jornada-builder-v2/mission-first-v3.md`, FR-51/NFR-13) exige que a
 * inferência de nicho/risco seja COMPARTILHADA entre o input do playbook-designer
 * (server-only) e o recomendador de capacidades puro
 * (`capabilities/recommend-capabilities.pure.ts`, client-safe). Por isso ela vive
 * aqui, num módulo 100% puro (zero IO, zero `any`, zero import de Prisma/runtime),
 * espelhando o padrão de `deploy/enabled-tools-derivation.pure.ts`.
 *
 * `designer-input.ts` re-importa daqui SEM duplicar lógica.
 */

import type { BuilderState } from '../cards/builder-state'

/** Vocabulário fechado das verticais que o Builder sabe reconhecer hoje. */
export type KnownVertical = 'imobiliário' | 'saúde' | 'delivery' | 'B2B'

/**
 * Trim + colapsa whitespace + corta no `max`. `undefined`/vazio → `undefined`.
 * É a mesma normalização usada em todo o módulo de playbook (single source).
 */
export function compact(value: string | undefined, max = 600): string | undefined {
  const trimmed = value?.trim().replace(/\s+/g, ' ')
  return trimmed && trimmed.length > 0 ? trimmed.slice(0, max) : undefined
}

/**
 * Junta vários campos de texto num único blob NORMALIZADO para matching:
 * compacta cada um, descarta vazios, remove acentos e baixa a caixa.
 * Determinístico — a base de toda inferência por regex deste módulo.
 */
export function foldText(values: readonly (string | undefined)[]): string {
  return values
    .map((value) => compact(value, 1000))
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * Reconhece uma das verticais curadas a partir de sinais de texto livre.
 * Retorna `undefined` quando nada bate (o caller decide o fallback).
 */
export function inferKnownVertical(
  values: readonly (string | undefined)[],
): KnownVertical | undefined {
  const text = foldText(values)
  if (/(imovel|imob|imobili|apartamento|empreend|empred|corretor|construtor)/.test(text)) {
    return 'imobiliário'
  }
  if (/(saude|clinica|medic|dent|psico|consulta|paciente)/.test(text)) {
    return 'saúde'
  }
  if (/(delivery|restaurante|lanch|pizza|comida|pedido|cardapio)/.test(text)) {
    return 'delivery'
  }
  if (/(b2b|software|saas|empresa|crm|diagnostico)/.test(text)) {
    return 'B2B'
  }
  return undefined
}

/**
 * Detecta o sinal de RISCO "empreendimento 100% vendido/esgotado" na fonte e
 * devolve o known-limit que protege o agente de prometer disponibilidade. Sem
 * sinal → `undefined`. É a única heurística de risco compartilhada hoje (o
 * recomendador usa este sinal para anexar `risk` às sugestões de SDR/agenda).
 */
export function soldOutLimit(
  values: readonly (string | undefined)[],
): string | undefined {
  const text = foldText(values)
  if (!/(100%\s*vendido|cem por cento vendido|esgotad[oa]|vendid[oa])/.test(text)) {
    return undefined
  }
  return 'O empreendimento aparece como 100% vendido/esgotado na fonte. Não prometa disponibilidade, compra, preço final ou visita sem confirmação humana; qualifique o interesse e encaminhe para consultor/lista de interesse ou alternativas.'
}

/**
 * Resolve o nicho do projeto: tenta a vertical curada a partir de todos os
 * sinais conhecidos; senão cai para o nicho informado, depois o nome do projeto
 * e por fim o genérico 'serviço local'. Nunca lança — sempre devolve string.
 */
export function inferNiche(
  state: BuilderState,
  inputNiche: string | undefined,
): string {
  const proposed = state.sourceIngestion.proposed
  const inferred = inferKnownVertical([
    inputNiche,
    state.project.objective,
    state.project.name,
    state.identity.description,
    proposed?.businessName,
    ...(proposed?.services ?? []),
    ...(proposed?.differentiators ?? []),
  ])
  return (
    inferred ??
    compact(inputNiche, 200) ??
    compact(state.project.name, 200) ??
    'serviço local'
  )
}
