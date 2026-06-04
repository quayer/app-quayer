/**
 * Text chunking para RAG.
 *
 * Estratégia: quebra por parágrafos/sentenças e acumula até ~`size` caracteres,
 * com `overlap` de caracteres entre chunks vizinhos (preserva contexto na borda).
 * Char-based (não token-based) de propósito — barato, determinístico e suficiente
 * para text-embedding-3-small. ~1000 chars ≈ ~250 tokens.
 *
 * Sem dependências externas; usado tanto na ingestão (PDF/URL/texto) quanto em
 * testes unitários.
 */

export interface ChunkOptions {
  /** Tamanho-alvo de cada chunk em caracteres. */
  size?: number
  /** Sobreposição em caracteres entre chunks consecutivos. */
  overlap?: number
}

export interface TextChunk {
  content: string
  ordinal: number
}

const DEFAULT_SIZE = 1000
const DEFAULT_OVERLAP = 150

/** Normaliza whitespace sem destruir quebras de parágrafo. */
function normalize(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Quebra `text` em chunks de ~`size` chars com `overlap`. Tenta cortar em
 * fronteiras naturais (parágrafo > sentença > espaço) para não partir palavras.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const size = Math.max(200, options.size ?? DEFAULT_SIZE)
  const overlap = Math.min(Math.max(0, options.overlap ?? DEFAULT_OVERLAP), Math.floor(size / 2))

  const clean = normalize(text)
  if (!clean) return []
  if (clean.length <= size) return [{ content: clean, ordinal: 0 }]

  const chunks: TextChunk[] = []
  let start = 0
  let ordinal = 0

  while (start < clean.length) {
    let end = Math.min(start + size, clean.length)

    // Se não chegamos ao fim, procura uma fronteira natural perto de `end`
    // (até 200 chars antes) para evitar cortar no meio de uma palavra/frase.
    if (end < clean.length) {
      const window = clean.slice(start, end)
      const boundary =
        lastIndexOfAny(window, ['\n\n', '. ', '! ', '? ', '\n']) ??
        window.lastIndexOf(' ')
      if (boundary != null && boundary > size * 0.5) {
        end = start + boundary + 1
      }
    }

    const content = clean.slice(start, end).trim()
    if (content) {
      chunks.push({ content, ordinal })
      ordinal++
    }

    if (end >= clean.length) break
    start = Math.max(end - overlap, start + 1)
  }

  return chunks
}

/** Retorna o maior índice (fim do match) dentre os separadores dados, ou null. */
function lastIndexOfAny(haystack: string, seps: string[]): number | null {
  let best: number | null = null
  for (const sep of seps) {
    const idx = haystack.lastIndexOf(sep)
    if (idx >= 0) {
      const endOfMatch = idx + sep.length - 1
      if (best == null || endOfMatch > best) best = endOfMatch
    }
  }
  return best
}
