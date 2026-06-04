export interface DetectedLanguage {
  code: 'pt-BR' | 'en' | 'es'
  label: string
  confidence: number
}

const LANGUAGE_PROFILES: Array<{
  code: DetectedLanguage['code']
  label: string
  words: string[]
  chars?: RegExp
}> = [
  {
    code: 'pt-BR',
    label: 'português do Brasil',
    words: [
      'que',
      'para',
      'voce',
      'você',
      'nao',
      'não',
      'estou',
      'quero',
      'preciso',
      'trabalhista',
      'obrigado',
      'consulta',
    ],
    chars: /[ãõçáéíóúâêô]/i,
  },
  {
    code: 'en',
    label: 'inglês',
    words: [
      'the',
      'and',
      'you',
      'need',
      'want',
      'hello',
      'thanks',
      'please',
      'case',
      'appointment',
      'help',
    ],
  },
  {
    code: 'es',
    label: 'espanhol',
    words: [
      'que',
      'para',
      'usted',
      'quiero',
      'necesito',
      'hola',
      'gracias',
      'consulta',
      'trabajo',
      'abogado',
      'caso',
    ],
    chars: /[ñ¿¡]/i,
  },
]

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export function detectMessageLanguage(text: string): DetectedLanguage | null {
  const tokens = normalize(text)
  if (tokens.length < 3) return null

  const tokenSet = new Set(tokens)
  const scores = LANGUAGE_PROFILES.map((profile) => {
    const wordHits = profile.words.filter((word) =>
      tokenSet.has(word.toLowerCase()),
    ).length
    const charHit = profile.chars?.test(text) ? 1 : 0
    const score = wordHits + charHit
    return { profile, score }
  }).sort((a, b) => b.score - a.score)

  const best = scores[0]
  if (!best || best.score === 0) return null

  return {
    code: best.profile.code,
    label: best.profile.label,
    confidence: Math.min(0.95, best.score / Math.max(4, tokens.length * 0.35)),
  }
}

export function prependLanguageContext(
  content: string,
  language: DetectedLanguage | string | null | undefined,
): string {
  if (!language) return content

  const code = typeof language === 'string' ? language : language.code
  return `[Idioma detectado: ${code}]\n${content}`
}
