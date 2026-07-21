/**
 * oRPC — router raiz da migração (equivale ao igniter.router({ controllers }))
 *
 * Cada controller portado entra aqui com o MESMO namespace que tinha no
 * client Igniter (api.<namespace>.<action>), preservando a tabela de rotas
 * completa relativa ao prefixo do mount.
 *
 * Progresso da migração (menor -> maior):
 *   messages        3 actions  ✅ (spike do gate)
 *   deviceSessions  3 actions  ✅
 *   departments     5 actions  ✅ (primeiro colocalizado)
 *   providers       6 actions  ✅
 *   logs(+sse)      8 actions  — próximo
 *   auth           38 actions
 *   builder        72 actions
 */
import { list, getById, listSessions } from './messages.router'
import { deviceSessions } from './device-sessions.router'
import { departments } from '@/server/communication/departments/departments.orpc'
import { providers } from '@/server/core/providers/providers.orpc'

export const appRouter = {
  messages: {
    list,
    getById,
    listSessions,
  },
  deviceSessions,
  departments,
  providers,
}
