/**
 * Integration Builder — generic Webhook template (Wave 1, T13, FR-11)
 *
 * Concrete `IntegrationTemplate` instance for the "bring your own URL" case: the
 * user pastes the destination webhook URL and the agent POSTs the collected lead
 * data (nome/e-mail/telefone/mensagem) there as JSON via the materialized
 * `enviar_para_webhook` tool. Useful for connecting to systems that don't have a
 * ready-made template (CRMs, automations like n8n/Make/Zapier, custom endpoints).
 *
 * URL handling: `requestSpec.url` is a FIXED template string, but FR-11 requires
 * the user to supply the URL. We therefore model the destination as a credential
 * (`credentials.webhook_url`) and bake the `https://` scheme into the template:
 * `https://{{credentials.webhook_url}}`. This (a) keeps `requestSpec.url` a valid
 * URL for the schema's `z.string().url()` gate even before substitution, and (b)
 * GUARANTEES the resolved call is https, aligning with the executor's (T09)
 * https + SSRF re-validation. The user pastes host+path WITHOUT the scheme.
 *
 * Auth: `requestSpec.auth` is REQUIRED by the schema, so we model an OPTIONAL
 * shared secret as a custom `X-Webhook-Secret` header backed by the
 * `webhook_secret` credential. If the destination doesn't need a secret, the user
 * leaves it blank; an empty credential resolves to an empty header value, which
 * is acceptable (the executor still re-validates the call).
 *
 * Validated against `integrationTemplateSchema` at registry load (`./index.ts`)
 * and by T46's runtime parse test. Zero `any`, no IO.
 */

import type { IntegrationTemplate } from './integration-template.types'

export const genericWebhookTemplate: IntegrationTemplate = {
  slug: 'generic-webhook',
  displayName: 'Webhook (URL personalizada)',
  description:
    'Envia os dados coletados para uma URL (webhook) que você informar. Útil para conectar com sistemas que não têm um modelo pronto.',
  triggerDescription:
    'Quando o lead informar nome e contato e demonstrar interesse no produto/serviço.',
  toolName: 'enviar_para_webhook',
  requestSpec: {
    method: 'POST',
    // The user supplies the destination as `credentials.webhook_url` (host+path,
    // without scheme). Baking in `https://` keeps this a valid URL for the schema
    // gate and forces https on the resolved call.
    url: 'https://{{credentials.webhook_url}}',
    auth: {
      // Optional shared secret. An empty `webhook_secret` resolves to an empty
      // header, which is acceptable when the destination needs no validation.
      type: 'header',
      headerName: 'X-Webhook-Secret',
      credentialKey: 'webhook_secret',
    },
    headers: {
      'Content-Type': 'application/json',
    },
    bodyTemplate:
      '{"nome":"{{params.nome}}","email":"{{params.email}}","telefone":"{{params.telefone}}","mensagem":"{{params.mensagem}}"}',
    parameterMapping: [
      {
        name: 'nome',
        description: 'Nome completo do lead, como ele informou na conversa.',
        required: true,
      },
      {
        name: 'email',
        description: 'E-mail do lead (opcional). Envie apenas se o lead informar.',
        required: false,
      },
      {
        name: 'telefone',
        description:
          'Telefone/celular do lead com DDD (opcional). Envie apenas se o lead informar.',
        required: false,
      },
      {
        name: 'mensagem',
        description:
          'Resumo/mensagem do lead ou observação relevante da conversa (opcional).',
        required: false,
      },
    ],
    testPayload: {
      nome: 'TESTE Quayer - pode ignorar',
      email: 'teste-quayer@example.com',
      telefone: '',
      mensagem: 'Mensagem de teste enviada pela Quayer — pode ignorar.',
    },
  },
  credentialFields: [
    {
      key: 'webhook_url',
      label: 'URL do webhook',
      whereToGet:
        'Cole a URL que vai receber os dados (fornecida pelo sistema de destino). Informe o endereço sem o "https://" no começo — ex.: meusistema.com/webhooks/leads.',
      // Host + optional path, WITHOUT scheme (the template prefixes https://).
      formatRegex: '^[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}(/.*)?$',
      placeholder: 'meusistema.com/webhooks/leads',
    },
    {
      key: 'webhook_secret',
      label: 'Segredo (opcional)',
      whereToGet:
        'Se o destino exigir um segredo de validação, informe aqui. Caso contrário, deixe em branco.',
      placeholder: 'opcional — deixe em branco se não houver',
    },
  ],
}
