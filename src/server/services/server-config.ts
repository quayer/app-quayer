/**
 * Server-side env config — ponto ÚNICO de leitura/validação das chaves de serviço.
 *
 * Antes: APIFY_TOKEN / TAVILY_API_KEY eram lidas raw via `process.env` espalhadas
 * em 3+ arquivos, sem schema nem default — e o actor-id do Apify estava hardcoded.
 * Aqui centralizamos num z.object: documenta o formato, dá defaults e é o lugar
 * para, no futuro, marcar uma chave como obrigatória (parse passa a falhar cedo).
 *
 * Server-only por convenção (mora em services/, junto de redis/database). NÃO
 * importar de client component. As chaves NÃO são NEXT_PUBLIC_*, então o Next nem
 * as embute no bundle do browser — ler aqui no client só devolveria undefined.
 *
 * Reler `process.env` a cada chamada (sem memoizar) é proposital: mantém testes e
 * hot-reload refletindo mudanças de env em runtime; o custo de um parse de 3
 * campos é desprezível fora de qualquer caminho realmente quente.
 */

import { z } from 'zod'

const DEFAULT_INSTAGRAM_ACTOR = 'apify~instagram-profile-scraper'

const serverConfigSchema = z.object({
  /** Token da plataforma Apify (scraping de Instagram). Vazio = feature off. */
  APIFY_TOKEN: z.string().optional(),
  /** Chave da Tavily Search API. Vazio = busca web degrada para NO_API_KEY. */
  TAVILY_API_KEY: z.string().optional(),
  /** Actor do Apify p/ perfil de IG — configurável (antes hardcoded no tool). */
  APIFY_INSTAGRAM_ACTOR_ID: z.string().min(1).default(DEFAULT_INSTAGRAM_ACTOR),
  /** RAG: nº de chunks retornados ao agente (antes hardcoded em 5). */
  RAG_TOP_K: z.coerce.number().int().min(1).max(50).default(5),
  /** RAG: score mínimo de cosseno (0..1) p/ um chunk ser relevante (antes 0.75). */
  RAG_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  /** RAG: candidatos buscados antes do filtro de threshold (antes 12). */
  RAG_OVER_FETCH: z.coerce.number().int().min(1).max(200).default(12),
})

export type ServerConfig = z.infer<typeof serverConfigSchema>

/**
 * Resolve e valida a config de servidor a partir de `process.env`. Lança se uma
 * chave obrigatória estiver malformada (fail-fast) — hoje todas são opcionais/
 * com default, então na prática nunca lança, mas o contrato fica pronto.
 */
export function getServerConfig(): ServerConfig {
  return serverConfigSchema.parse({
    APIFY_TOKEN: process.env.APIFY_TOKEN,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
    APIFY_INSTAGRAM_ACTOR_ID: process.env.APIFY_INSTAGRAM_ACTOR_ID,
    RAG_TOP_K: process.env.RAG_TOP_K,
    RAG_THRESHOLD: process.env.RAG_THRESHOLD,
    RAG_OVER_FETCH: process.env.RAG_OVER_FETCH,
  })
}
