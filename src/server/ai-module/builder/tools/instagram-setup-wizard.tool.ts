/**
 * instagram_setup_wizard — Builder tool (Wave 3.1)
 *
 * Emits the wizard configuration for connecting Instagram Direct via
 * Meta Graph API. Mirrors the WhatsApp Cloud pattern: the user creates
 * a Meta App, configures a webhook → Quayer, then pastes their Page
 * Access Token + Instagram Business Account ID.
 *
 * The tool is purely presentational — it returns:
 *   - webhookUrl   → the URL the user must paste in Meta Developer Console
 *   - verifyToken  → opaque value the user pastes as "Verify Token"
 *   - steps[]      → ordered step metadata rendered by InstagramSetupCard
 *
 * Credentials are NEVER sent through chat. The card POSTs directly to
 * /api/v1/instances with the broker='INSTAGRAM' payload. On success,
 * the card posts a safe follow-up message to chat so the Builder LLM
 * knows to advance to deploy.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { buildBuilderTool } from './build-tool'

export interface BuilderToolExecutionContext {
  projectId: string
  organizationId: string
  userId: string
}

interface WizardStep {
  key: 'create-app' | 'configure-webhook' | 'paste-tokens' | 'connect'
  title: string
  description: string
  /** External URL the user needs to visit — null for in-chat steps */
  externalUrl: string | null
  /** Short list of bullet instructions rendered in the step */
  instructions: string[]
}

/**
 * Builds the ordered wizard steps. Kept as a factory so the webhook URL
 * can be injected per-org once we have tenant-scoped webhook endpoints
 * (currently it's a single shared endpoint).
 */
function buildSteps(webhookUrl: string): WizardStep[] {
  return [
    {
      key: 'create-app',
      title: 'Criar app no Meta',
      description:
        'Você precisa de um app no Meta for Developers com o produto Instagram Graph API ativo.',
      externalUrl: 'https://developers.facebook.com/apps/',
      instructions: [
        'Entre em developers.facebook.com/apps e clique em "Criar app"',
        'Selecione o tipo "Business" e preencha o nome do app',
        'Na lista de produtos, adicione "Instagram Graph API"',
        'Conecte sua página do Facebook + conta Instagram Business',
      ],
    },
    {
      key: 'configure-webhook',
      title: 'Configurar webhook',
      description:
        'Cole a URL abaixo e o verify token no painel do Meta para receber mensagens na Quayer.',
      externalUrl: null,
      instructions: [
        'Em "Instagram Graph API" → "Webhooks", clique em "Editar assinaturas"',
        'Cole a Callback URL e o Verify Token mostrados aqui no card',
        'Assine os campos: messages, messaging_postbacks, messaging_seen',
        'Clique em "Verificar e salvar"',
      ],
    },
    {
      key: 'paste-tokens',
      title: 'Pegar Access Token + IDs',
      description:
        'Você vai precisar do Page Access Token e do Instagram Business Account ID.',
      externalUrl: 'https://developers.facebook.com/tools/explorer/',
      instructions: [
        'No Graph API Explorer, gere um "Page Access Token" (nunca expire)',
        'Copie o Instagram Business Account ID (campo "ig_business_account")',
        'Copie o Page ID da sua página Facebook (pode ficar em branco)',
        'Cole tudo nos campos abaixo — fica salvo criptografado',
      ],
    },
    {
      key: 'connect',
      title: 'Conectar',
      description:
        'A Quayer valida com o Meta e ativa o recebimento de DMs. Pode levar alguns segundos.',
      externalUrl: null,
      instructions: [
        'Clique em "Conectar Instagram"',
        'Se falhar, revise os tokens e o webhook',
        'Depois de conectado, envie uma DM de teste',
      ],
    },
  ]
}

export function instagramSetupWizardTool(_ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'instagram_setup_wizard',
    metadata: { isReadOnly: true, isConcurrencySafe: true },
    tool: tool({
      description:
        'Guides the user through connecting Instagram Direct via Meta Graph API. Renders a 4-step wizard with webhook URL + verify token to copy, and form inputs for the access token and account IDs. Use ONLY after the user picks "instagram" in select_channel. Does NOT mutate — the card POSTs credentials directly to /api/v1/instances (not through chat) for security.',
      inputSchema: z.object({
        name: z
          .string()
          .min(2)
          .max(100)
          .describe(
            'Friendly name for the Instagram instance, e.g. "Minha Loja IG". Shown in the Connections list.',
          ),
      }),
      execute: async (input) => {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
        const webhookUrl = `${baseUrl}/api/v1/webhooks/instagram`
        const verifyToken =
          process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ??
          'quayer-verify-token-dev'

        return {
          success: true as const,
          name: input.name,
          webhookUrl,
          verifyToken,
          steps: buildSteps(webhookUrl),
          message: `Wizard de Instagram iniciado para "${input.name}".`,
        }
      },
    }),
  })
}
