/**
 * Builder Cards — Sugestão DETERMINÍSTICA de saudação por persona (Onda C, G7)
 *
 * Helper PURO e determinístico para o `agent-persona-card.tsx`. Dado o modo de
 * voz escolhido (chip), o nome do negócio e o nicho derivado do texto livre,
 * devolve UMA saudação inicial pronta para a textarea — o botão "Sugerir nova".
 *
 * Espelha o keyword-suggestions.ts da Onda A: mesma postura `normalizeText`
 * (lowercase + sem acento) + casamento por substring sobre `PROFESSION_ALIASES`
 * para inferir o nicho a partir do TEXTO LIVRE que o usuário já forneceu
 * (value.project.objective + value.proposal.description). NÃO existe slug de
 * profissão aqui — o nicho vira um substantivo de "local" (a clínica, o
 * escritório…) que entra no template da frase.
 *
 * SEM rede, SEM Math.random, SEM IO — 100% determinístico e re-executável.
 * Entrada vazia/undefined cai numa saudação genérica amigável, nunca lança.
 *
 * Reaproveita o catálogo `PROFESSION_ALIASES` do keyword-suggestions.ts (única
 * fonte da verdade dos aliases por nicho) para não duplicar/divergir o mapa.
 */

import { PROFESSION_ALIASES } from "../keyword-suggestions"
import type { SpeechMode } from "./speech-mode"

export type { SpeechMode }

/**
 * Substantivo de "local" por nicho (chave canônica do PROFESSION_ALIASES). Já
 * vem com o artigo embutido para a contração correta de "a/o + X" no template.
 * Conceitualmente espelha o VENUE_BY_PROFESSION do Orayon, mas atrelado às
 * MESMAS chaves de nicho usadas no keyword-suggestions, evitando dois catálogos.
 */
const VENUE_BY_NICHE: Record<string, string> = {
  dentista: "a clínica",
  advogado: "o escritório",
  personal: "o estúdio",
  psicologo: "o consultório",
  clinica: "a clínica",
  estetica: "o studio",
  imobiliaria: "a imobiliária",
  contador: "o escritório",
  petshop: "o petshop",
  restaurante: "o restaurante",
}

/** Local genérico quando o nicho não é reconhecido. */
const DEFAULT_VENUE = "o atendimento"

/** Input lido (read-only) da BuilderState + escolha do chip no Passo A. */
export interface SuggestGreetingInput {
  /** Chip de voz selecionado no Passo A (persona.speechMode). */
  speechMode?: SpeechMode
  /** Nome do negócio digitado no Passo A (persona.name). */
  businessName?: string
  /**
   * Texto livre que orienta o nicho — concatenação de
   * value.project.objective + value.proposal.description (mesmas entradas que o
   * keyword-suggestions lê). NÃO é um slug; é texto cru para casar aliases.
   */
  niche?: string
}

/**
 * Normaliza texto para o match: lowercase + remove acentos (NFD + strip dos
 * diacríticos combinantes). Undefined/null vira string vazia — nunca lança.
 * Mesma implementação do keyword-suggestions.ts (mantida local para o helper
 * permanecer puro/independente).
 */
function normalizeText(input: string | undefined): string {
  if (!input) return ""
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

/**
 * Infere a chave de nicho a partir do texto livre, percorrendo
 * PROFESSION_ALIASES na ordem de inserção (mais específico antes do genérico) e
 * devolvendo a PRIMEIRA chave cujo alias aparece como substring. `null` quando
 * nada casa (ou texto vazio).
 */
function resolveNicheKey(niche: string | undefined): string | null {
  const haystack = normalizeText(niche)
  if (haystack.length === 0) return null
  for (const [key, aliases] of Object.entries(PROFESSION_ALIASES)) {
    if (aliases.some((alias) => haystack.includes(alias))) return key
  }
  return null
}

/**
 * Resolve o substantivo de "local" (com artigo) a partir do nicho. Cai no
 * DEFAULT_VENUE quando o nicho não é reconhecido.
 */
function venueFor(niche: string | undefined): string {
  const key = resolveNicheKey(niche)
  return (key && VENUE_BY_NICHE[key]) || DEFAULT_VENUE
}

/**
 * Constrói "da X" / "do X" / "de @perfil" a partir do nome do negócio, tratando
 * o artigo embutido para a contração correta. Espelha o `fromPhrase` do Orayon.
 */
function fromPhrase(firm: string): string {
  const s = firm.trim()
  const low = s.toLowerCase()
  if (low.startsWith("a ")) return `da ${s.slice(2).trim()}`
  if (low.startsWith("as ")) return `das ${s.slice(3).trim()}`
  if (low.startsWith("o ")) return `do ${s.slice(2).trim()}`
  if (low.startsWith("os ")) return `dos ${s.slice(3).trim()}`
  if (low.startsWith("@") || s.includes("_")) return `de ${s}`
  return `da ${s}`
}

/**
 * Constrói "à X" / "ao X" (boas-vindas) a partir de um local/negócio, tratando o
 * artigo embutido. Espelha o `welcomePhrase` do Orayon.
 */
function welcomePhrase(target: string): string {
  const s = target.trim()
  const low = s.toLowerCase()
  if (low.startsWith("a ")) return `à ${s.slice(2).trim()}`
  if (low.startsWith("as ")) return `às ${s.slice(3).trim()}`
  if (low.startsWith("o ")) return `ao ${s.slice(2).trim()}`
  if (low.startsWith("os ")) return `aos ${s.slice(3).trim()}`
  if (low.startsWith("@") || s.includes("_")) return `ao perfil ${s}`
  return `à ${s}`
}

/**
 * Sugere uma saudação inicial DETERMINÍSTICA, alinhada ao modo de voz escolhido.
 *
 * Algoritmo (puro, re-executável — mesma entrada ⇒ mesma saída):
 *  1. infere o "local" a partir do nicho (texto livre) via PROFESSION_ALIASES;
 *  2. usa o nome do negócio quando presente, senão cai no local do nicho;
 *  3. monta a frase pelo template do `speechMode` (assistant/first_person/
 *     secretary), com fallback genérico amigável quando não há contexto.
 *
 * Nunca lança; entrada toda vazia ⇒ saudação genérica.
 */
export function suggestGreeting(input: SuggestGreetingInput): string {
  const mode: SpeechMode = input.speechMode ?? "assistant"
  const firm = (input.businessName ?? "").trim()
  const venue = venueFor(input.niche)

  switch (mode) {
    case "first_person":
      // 1ª pessoa — como se fosse o(a) próprio(a) profissional respondendo.
      return firm
        ? `Oi! 😊 Aqui é ${fromPhrase(firm)} mesmo. Como posso te ajudar?`
        : `Oi! 😊 Sou eu mesmo(a) aqui ${welcomePhrase(venue)}. Como posso te ajudar?`

    case "secretary":
      // 3ª pessoa — fala como a recepção/secretaria do negócio.
      return firm
        ? `Oi! 😊 Aqui é da secretaria ${fromPhrase(firm)}. Como posso te ajudar?`
        : `Oi! 😊 Aqui é da secretaria ${welcomePhrase(venue)}. Como posso te ajudar?`

    case "assistant":
    default:
      // 3ª pessoa — assistente em nome do negócio (padrão).
      return firm
        ? `Oi! Sou o assistente ${fromPhrase(firm)}. Como posso te ajudar hoje? 😊`
        : `Oi! Sou o assistente ${welcomePhrase(venue)}. Como posso te ajudar hoje? 😊`
  }
}
