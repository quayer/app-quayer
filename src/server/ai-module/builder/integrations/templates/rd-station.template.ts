/**
 * Integration Builder — RD Station Marketing template (Wave 1, T13)
 *
 * Concrete `IntegrationTemplate` instance for RD Station Marketing's public
 * **Conversion event API** (https://developers.rdstation.com). When the lead
 * shows interest and shares name + contact, the agent fires the materialized
 * `enviar_lead_rd_station` tool, which POSTs a CONVERSION event so RD Station
 * creates/updates the contact and (optionally) triggers automations there.
 *
 * Auth: the SIMPLEST public form for leiga users — the **public API token**
 * (`api_key`) carried as a query param (`?api_key=...`), so the user only needs
 * to copy one token from RD Station → Integrações → Token de API público. The
 * token is stored as a write-only credential (`credentials.api_key`); the URL in
 * `requestSpec` stays clean (`.../platform/conversions`) and the executor (T09)
 * appends the `api_key` query param from the secret store at call time.
 *
 * The object is validated against `integrationTemplateSchema` at registry load
 * (`./index.ts`) and again by T46's runtime parse test. Zero `any`, no IO.
 */

import type { IntegrationTemplate } from './integration-template.types'

export const rdStationTemplate: IntegrationTemplate = {
  slug: 'rd-station',
  displayName: 'RD Station',
  description:
    'Envia os dados do lead (nome, e-mail, telefone) para o RD Station Marketing quando o lead demonstra interesse, criando/atualizando o contato lá.',
  triggerDescription:
    'Quando o lead informar nome e contato e demonstrar interesse no produto/serviço.',
  toolName: 'enviar_lead_rd_station',
  requestSpec: {
    method: 'POST',
    // URL stays clean; the `api_key` query param is injected by the executor
    // (T09) from `credentials.api_key` via the `auth` block below.
    url: 'https://api.rd.services/platform/conversions',
    auth: {
      type: 'query',
      queryParam: 'api_key',
      credentialKey: 'api_key',
    },
    headers: {
      'Content-Type': 'application/json',
    },
    // JSON string template — the executor substitutes the {{params.*}} leaves
    // and parses the result before sending.
    bodyTemplate:
      '{"event_type":"CONVERSION","event_family":"CDP","payload":{"conversion_identifier":"Quayer - Lead WhatsApp","name":"{{params.nome}}","email":"{{params.email}}","mobile_phone":"{{params.telefone}}"}}',
    parameterMapping: [
      {
        name: 'nome',
        description: 'Nome completo do lead, como ele informou na conversa.',
        required: true,
      },
      {
        name: 'email',
        description: 'E-mail do lead. Obrigatório — o RD Station identifica o contato pelo e-mail.',
        required: true,
      },
      {
        name: 'telefone',
        description:
          'Telefone/celular do lead com DDD (opcional). Envie apenas se o lead informar.',
        required: false,
      },
    ],
    testPayload: {
      nome: 'TESTE Quayer - pode ignorar',
      email: 'teste-quayer@example.com',
      telefone: '',
    },
    successWhen: {
      // RD Station returns HTTP 200 when the conversion event is accepted.
      httpStatusIn: [200],
    },
  },
  credentialFields: [
    {
      key: 'api_key',
      label: 'Token de API (api_key) do RD Station',
      whereToGet:
        'No RD Station Marketing: Integrações → Token de API público. Copie o token e cole aqui.',
      placeholder: 'cole aqui o token público do RD Station',
    },
  ],
}
