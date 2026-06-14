/**
 * business-signal-extractor — F5+ (Motor de Estratégia, passo 1).
 *
 * Lê a FONTE do negócio (site/texto/arquivos já capturados no builderState) e
 * extrai `BusinessSignals` DETERMINÍSTICOS — booleanos + tipo/subtipo + fatos curtos.
 * É a "leitura de evidências" que alimenta o diagnóstico de estratégia; NADA aqui
 * vem de invenção do LLM. Pura: zero IO, zero `any`, não muta o input.
 */

import type { BuilderState } from '../cards/builder-state'
import {
  foldText,
  inferKnownVertical,
} from '../playbook/niche-inference.pure'
import { hasSoldOutSourceSignal } from '../playbook/designer-input'
import type { BusinessSignals } from './strategy.types'

/** Trim → undefined quando vazio. */
function clean(value: string | undefined | null): string | undefined {
  const t = value?.trim()
  return t && t.length > 0 ? t : undefined
}

/** Normaliza a vertical curada (com acento) para a chave ascii do motor. */
function normalizeBusinessType(vertical: string | undefined): string {
  if (!vertical) return 'generico'
  return vertical
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Junta os textos da fonte num haystack ascii/minúsculo para o scan de sinais. */
function buildHaystack(state: BuilderState): string {
  const proposed = state.sourceIngestion.proposed
  return foldText([
    state.project.name,
    state.project.objective,
    state.identity.description,
    state.identity.address,
    state.proposal.description,
    proposed?.businessName,
    proposed?.address,
    ...(proposed?.services ?? []),
    ...(proposed?.differentiators ?? []),
  ])
}

/** Coleta os fatos curtos da fonte (para "detectei ..." no card). */
function collectSourceFacts(state: BuilderState): string[] {
  const proposed = state.sourceIngestion.proposed
  const facts = [
    clean(proposed?.businessName),
    clean(state.identity.address) ?? clean(proposed?.address),
    ...(proposed?.services ?? []).map(clean),
    ...(proposed?.differentiators ?? []).map(clean),
  ].filter((f): f is string => f !== undefined)
  // Dedup preservando ordem + cap.
  return Array.from(new Set(facts)).slice(0, 8)
}

/**
 * Extrai os sinais do negócio do builderState. Determinístico e conservador:
 * cada sinal é um scan de palavras-chave sobre o texto JÁ capturado da fonte
 * (+ flags estruturais do state). Pura.
 */
export function extractBusinessSignals(state: BuilderState): BusinessSignals {
  const hay = buildHaystack(state)

  const businessType = normalizeBusinessType(
    inferKnownVertical([
      state.project.objective,
      state.project.name,
      state.identity.description,
      state.sourceIngestion.proposed?.businessName,
      ...(state.sourceIngestion.proposed?.services ?? []),
      ...(state.sourceIngestion.proposed?.differentiators ?? []),
    ]),
  )

  const hasAddress =
    clean(state.identity.address) !== undefined ||
    clean(state.sourceIngestion.proposed?.address) !== undefined
  const hasPricing = state.pricing.items.length > 0
  const hasFinancingSignal = /(financ|entrada|fgts|parcel|credito|subsidi)/.test(
    hay,
  )
  const hasMcmvSignal =
    /(minha casa minha vida|\bmcmv\b|casa verde|programa habitacional|subsidi)/.test(
      hay,
    )
  const hasVisitGoal = /(visita|tour|decorado|conhecer o imovel|conhecer o apartamento|stand de vendas)/.test(
    hay,
  )
  const hasSchedulingSignal =
    state.handoff.alsoSchedule === true ||
    /(agend|marcar|horario|consulta|reserva|reuniao)/.test(hay)
  // Produto específico: marcadores de "1 empreendimento/lançamento" OU endereço
  // num negócio imobiliário (1 imóvel com endereço próprio, não um catálogo).
  const hasSpecificProduct =
    /(empreendimento|lancamento|residencial|condominio|\btorre\b|studio|stand de vendas)/.test(
      hay,
    ) || (businessType === 'imobiliario' && hasAddress)
  const soldOutRisk = hasSoldOutSourceSignal(state)
  const regulated =
    businessType === 'saude' ||
    /(advoc|advogad|juridic|odontolog|psicolog|nutricion|fisioterap)/.test(hay)

  // Subtipo comercial (curado por vertical; só os que o diagnóstico usa hoje).
  let subtype: string | undefined
  if (businessType === 'imobiliario') {
    subtype = hasSpecificProduct
      ? 'empreendimento_especifico'
      : 'imobiliaria_generica'
  }

  return {
    businessType,
    ...(subtype ? { subtype } : {}),
    hasAddress,
    hasPricing,
    hasSpecificProduct,
    hasVisitGoal,
    hasSchedulingSignal,
    hasFinancingSignal,
    hasMcmvSignal,
    soldOutRisk,
    regulated,
    sourceFacts: collectSourceFacts(state),
  }
}
