interface TextIndex {
  normalized: string
  tokens: Set<string>
}

const STOP_WORDS = new Set([
  'a',
  'ao',
  'aos',
  'as',
  'ate',
  'caso',
  'com',
  'como',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'essa',
  'esse',
  'esta',
  'este',
  'estiver',
  'for',
  'houver',
  'ja',
  'lhe',
  'mais',
  'me',
  'na',
  'nas',
  'no',
  'nos',
  'o',
  'os',
  'ou',
  'para',
  'pela',
  'pelo',
  'pode',
  'por',
  'precisa',
  'prefere',
  'qual',
  'quais',
  'quando',
  'quanto',
  'quantos',
  'deseja',
  'onde',
  'que',
  'quem',
  'quer',
  'se',
  'sem',
  'sua',
  'suas',
  'um',
  'uma',
  'voce',
  'your',
  'the',
  'and',
  'for',
  'with',
  'when',
])

const SEMANTIC_TERMS: Record<string, string[]> = {
  agenda: ['agendar', 'agendamento', 'horario', 'marcar'],
  agendamento: ['agenda', 'agendar', 'horario', 'marcar'],
  agendar: ['agenda', 'agendamento', 'horario', 'marcar'],
  apartamento: ['imovel', 'imoveis', 'unidade'],
  bairro: ['regiao', 'localizacao', 'local'],
  celular: ['telefone', 'whatsapp', 'contato'],
  contato: ['telefone', 'celular', 'whatsapp', 'email'],
  custo: ['preco', 'valor', 'orcamento', 'investimento'],
  disponibilidade: ['disponivel', 'disponiveis', 'vagas', 'unidades'],
  disponivel: ['disponibilidade', 'disponiveis', 'vagas', 'unidades'],
  disponiveis: ['disponibilidade', 'disponivel', 'vagas', 'unidades'],
  endereco: ['localizacao', 'local', 'regiao'],
  faixa: ['valor', 'preco', 'orcamento', 'investimento'],
  humano: ['atendente', 'equipe', 'pessoa', 'transferir', 'handoff'],
  imovel: ['imoveis', 'apartamento', 'casa', 'unidade'],
  imoveis: ['imovel', 'apartamento', 'casa', 'unidade'],
  investimento: ['valor', 'preco', 'orcamento', 'faixa'],
  local: ['regiao', 'bairro', 'localizacao', 'endereco'],
  localizacao: ['regiao', 'bairro', 'local', 'endereco'],
  orcamento: ['preco', 'valor', 'investimento', 'faixa'],
  preco: ['valor', 'orcamento', 'investimento', 'faixa', 'custo'],
  regiao: ['bairro', 'localizacao', 'local', 'endereco'],
  telefone: ['celular', 'whatsapp', 'contato'],
  transferir: ['humano', 'atendente', 'equipe', 'handoff'],
  valor: ['preco', 'orcamento', 'investimento', 'faixa', 'custo'],
  whatsapp: ['telefone', 'celular', 'contato'],
}

export function compactEvidence(value: string, max = 900): string {
  const compact = value.trim().replace(/\s+/g, ' ')
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact
}

export function safeCheckId(...parts: readonly string[]): string {
  return parts
    .join('.')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120)
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenVariants(token: string): string[] {
  const variants = new Set([token, ...(SEMANTIC_TERMS[token] ?? [])])

  if (token.endsWith('s') && token.length > 4) {
    variants.add(token.slice(0, -1))
  } else if (token.length > 4) {
    variants.add(`${token}s`)
  }

  return Array.from(variants)
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter(
      (token) =>
        token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+$/.test(token),
    )
}

export function uniqueTokens(...values: readonly string[]): string[] {
  return Array.from(new Set(values.flatMap(tokenize)))
}

export function buildTextIndex(value: string): TextIndex {
  return {
    normalized: normalizeText(value),
    tokens: new Set(tokenize(value)),
  }
}

export function hasAnyToken(
  index: TextIndex,
  tokens: readonly string[],
): boolean {
  return tokens.some((token) =>
    tokenVariants(token).some((variant) => index.tokens.has(variant)),
  )
}

export function tokenCoverage(
  index: TextIndex,
  tokens: readonly string[],
): number {
  if (tokens.length === 0) return 1

  const matched = tokens.filter((token) =>
    tokenVariants(token).some((variant) => index.tokens.has(variant)),
  ).length

  return matched / tokens.length
}

export function hasPhraseOrCoverage(
  index: TextIndex,
  value: string,
  minimumCoverage = 0.55,
): boolean {
  const normalized = normalizeText(value)
  if (normalized && index.normalized.includes(normalized)) return true

  const tokens = uniqueTokens(value)
  if (tokens.length === 0) return false
  if (tokens.length === 1) return hasAnyToken(index, tokens)

  return tokenCoverage(index, tokens) >= minimumCoverage
}

export function splitSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?;:])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}
