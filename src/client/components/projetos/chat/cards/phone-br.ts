/**
 * Builder Cards — Normalização de telefone BR para E.164 (Orayon Uplift, G6)
 *
 * Helpers puros (sem DOM, sem React) para transformar um telefone digitado por
 * um profissional leigo no formato canônico E.164 (`+55DDDNNNNNNNN`) e validar a
 * forma final. Portados de `SilencedContactsInlineCard` do Orayon.Profissoes
 * (`normalizeBrE164` / `isValidE164`) para manter PARIDADE com a normalização
 * que o backend faz em `apply-card-submit.ts` (`normalizeWhatsappBr`).
 *
 * Regra de ouro: só retornamos um número quando temos confiança na forma. Em
 * qualquer dúvida devolvemos `null` para que o card bloqueie o confirm e peça
 * correção — telefone é OPCIONAL, então vazio é permitido; o que não toleramos é
 * gravar lixo.
 *
 * Por serem puros (string-in / string|null-out) estes helpers servem tanto ao
 * componente quanto a qualquer porta server-side que precise validar igual.
 */

/**
 * Normaliza um telefone brasileiro digitado livre para E.164 (`+55DDDNNNNNNNN`).
 *
 * Aceita as formas mais comuns que um usuário digita no Brasil:
 *  - `(11) 99999-9999`, `11 99999-9999`, `11999999999` → assume DDI 55.
 *  - `5511999999999` (já com DDI 55) → prefixa `+`.
 *  - `+55 11 99999-9999` (já internacional) → mantém os dígitos com `+`.
 *  - Estrangeiros já em `+...` com 10–15 dígitos passam adiante.
 *
 * @param raw Texto bruto digitado pelo usuário (pode conter espaços, traços,
 *   parênteses, `+`, etc).
 * @returns O número em E.164 (`+` seguido de 10 a 15 dígitos) ou `null` quando
 *   não há confiança suficiente na forma.
 */
export function normalizeBrPhone(raw: string): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, "")
  if (!digits) return null

  // Já vem com DDI 55 (12 dígitos = fixo, 13 = celular com 9).
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
    return `+${digits}`
  }

  // Local com DDD: 10 dígitos (fixo) ou 11 (celular com 9) — assume Brasil.
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`
  }

  // Estrangeiro ou já prefixado com `+` — repassa se o tamanho for plausível.
  if (raw.startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`
  }

  return null
}

/**
 * Valida que uma string já está na forma canônica E.164 (`+` seguido de 10 a 15
 * dígitos). Use SEMPRE em conjunto com {@link normalizeBrPhone}: normalize
 * primeiro, valide o resultado.
 *
 * @param v Candidato a E.164.
 * @returns `true` quando `v` casa `^\+\d{10,15}$`.
 */
export function isValidBrE164(v: string): boolean {
  return /^\+\d{10,15}$/.test(v)
}
