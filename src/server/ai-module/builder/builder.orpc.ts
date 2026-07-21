/**
 * Builder — agregador do namespace (espelho do builder.controller.ts).
 *
 * Mantém o contrato do client (api.builder.*) unificando os lotes migrados.
 * Cresce lote a lote:
 *   B1 projects ✅ crud (9) + prompt (3) + metrics (2) + channel (4) +
 *                  proactive-history (1) = 19 actions
 *                  (playgroundStream é SSE — fica no Igniter até o cutover,
 *                  vira route handler Next puro, como /logs/stream)
 *   B2 chat + cards ✅ chat (3) + sheetParse (1) = 4 actions
 *                  (sendMessage e submitCard são SSE — o ACK conversational do
 *                  card usa buildSseResponse — ficam no Igniter até a fase 4)
 *   B3 sources + media + knowledge ✅ sources (3) + sourceImages (3) +
 *                  media (2) + knowledge (3) + knowledgeSource (3) = 14 actions
 *   B4 channel + deploy ✅ channelCredentials (2) + provisionWhatsApp (1) +
 *                  refreshQr (1) + deploy (4) = 8 actions
 *   B5 identity/calendar/connections/pricing/credential/capabilities/
 *      integrations — pendente
 */
import { crudActions } from './projects/routes/crud.orpc'
import { promptActions } from './projects/routes/prompt.orpc'
import { metricsActions } from './projects/routes/metrics.orpc'
import { channelActions } from './projects/routes/channel.orpc'
import { proactiveHistoryActions } from './projects/routes/proactive-history.orpc'
import { chatActions } from './chat/chat.orpc'
import { sheetParseActions } from './cards/sheet-parse.orpc'
import { sourcesActions } from './sources/sources.orpc'
import { sourceImagesActions } from './sources/source-images.orpc'
import { mediaCurationActions } from './media/media-curation.orpc'
import { knowledgeActions } from './knowledge/knowledge.orpc'
import { knowledgeSourceActions } from './knowledge/knowledge-source.orpc'
import { channelCredentialsActions } from './channel/channel-credentials.orpc'
import { provisionWhatsAppActions } from './channel/provision-whatsapp.orpc'
import { refreshQrActions } from './channel/refresh-qr.orpc'
import { deployActions } from './deploy/deploy.orpc'

export const builder = {
  ...crudActions,
  ...promptActions,
  ...metricsActions,
  ...channelActions,
  ...proactiveHistoryActions,
  ...chatActions,
  ...sheetParseActions,
  ...sourcesActions,
  ...sourceImagesActions,
  ...mediaCurationActions,
  ...knowledgeActions,
  ...knowledgeSourceActions,
  ...channelCredentialsActions,
  ...provisionWhatsAppActions,
  ...refreshQrActions,
  ...deployActions,
}
