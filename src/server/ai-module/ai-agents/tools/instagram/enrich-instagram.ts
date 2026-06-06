/**
 * enrich_instagram — busca dados públicos de um perfil do Instagram p/ enriquecer
 * o lead (bio, seguidores, posts recentes). Roda o actor Apify
 * `instagram-profile-scraper` de forma síncrona, com cache Redis de 24h por handle.
 *
 * On-demand: o agente chama quando o cliente menciona um @/perfil. Fail-safe:
 * Apify ausente/erro/timeout → { success:false, error } (nunca derruba o agente).
 *
 * MVP: token via env APIFY_TOKEN (BYOK por org via OrganizationProvider = fase 2).
 * Imagens/vídeos do perfil + persistência em ChatSession.customFields = fase 2.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { getRedis } from '@/server/services/redis'
import { getServerConfig } from '@/server/services/server-config'
import { runActorSync } from '@/lib/providers/apify/apify-runner'
import {
  normalizeInstagramProfile,
  type InstagramProfile,
} from '@/lib/providers/apify/instagram-normalizer'
import type { ToolExecutionContext } from '../builtin-tools'

const CACHE_TTL_SECONDS = 24 * 60 * 60

// Cache namespaced por actor: evita colisão de key se um dia houver >1 actor
// resolvendo o mesmo username com payloads/saídas diferentes.
function cacheKey(actor: string, username: string): string {
  return `apify:ig:${actor}:${username}`
}

async function readCache(actor: string, username: string): Promise<InstagramProfile | null> {
  try {
    const redis = getRedis()
    const raw = await redis.get(cacheKey(actor, username))
    return raw ? (JSON.parse(raw) as InstagramProfile) : null
  } catch {
    return null
  }
}

async function writeCache(
  actor: string,
  username: string,
  profile: InstagramProfile,
): Promise<void> {
  try {
    const redis = getRedis()
    await redis.set(
      cacheKey(actor, username),
      JSON.stringify(profile),
      'EX',
      CACHE_TTL_SECONDS,
    )
  } catch {
    // cache é best-effort
  }
}

export function createEnrichInstagramTool(_ctx: ToolExecutionContext) {
  return tool({
    description:
      'Busca dados PÚBLICOS de um perfil do Instagram (nome, bio, seguidores, posts recentes) para entender/contextualizar o lead. Use quando o cliente mencionar um @ ou link de perfil do Instagram.',
    inputSchema: z.object({
      handle: z.string().min(1).describe('@usuario ou nome de usuário do Instagram'),
      max_posts: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Quantos posts recentes trazer (default 5).'),
    }),
    execute: async ({ handle, max_posts }) => {
      const { APIFY_TOKEN: token, APIFY_INSTAGRAM_ACTOR_ID: actor } = getServerConfig()
      if (!token) {
        return { success: false, error: 'Enriquecimento de Instagram não configurado.' }
      }

      const username = handle.replace(/^@/, '').trim().toLowerCase()
      if (!username) return { success: false, error: 'Handle inválido.' }

      const cached = await readCache(actor, username)
      if (cached) return { success: true, profile: cached, cached: true }

      try {
        const items = await runActorSync(
          actor,
          { usernames: [username], resultsLimit: max_posts ?? 5 },
          token,
          { timeoutMs: 20_000 },
        )
        const profile = normalizeInstagramProfile(items, max_posts ?? 5)
        if (!profile) {
          return { success: false, error: 'Perfil não encontrado ou privado.' }
        }
        await writeCache(actor, username, profile)
        return { success: true, profile }
      } catch (err) {
        console.error(
          '[enrich_instagram] falhou:',
          err instanceof Error ? err.message : String(err),
        )
        return { success: false, error: 'Não consegui carregar o perfil agora.' }
      }
    },
  })
}
