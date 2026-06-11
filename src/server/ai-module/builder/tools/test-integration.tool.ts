/**
 * Builder Tool — test_integration (Integration Builder Wave 2, T23)
 *
 * THIN, agent-initiated wrapper over the credential TEST runner (T14). It owns
 * NO business logic of its own: it resolves the tenant + acting user from the
 * Builder chat context, delegates to `runIntegrationTest`, and surfaces ONLY the
 * value-free signals (`outcome` + leiga pt-BR `diagnosis`) so the chat can
 * narrate the result. No card is involved here — the credentials card (T40)
 * owns the test-from-card path; this tool is the explicit agent-initiated test.
 *
 * The runner never throws and already returns a neutral `not_found` outcome when
 * the integration is missing / foreign / soft-deleted, so we simply pass that
 * through. Credentials, request/response bodies, and HTTP details are NEVER
 * returned by this tool.
 *
 * Zero `any`.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { runIntegrationTest } from '../integrations/test-call.runner'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './list-instances.tool'

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function testIntegrationTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'test_integration',
    // Performs a real outbound call (a write to the integration's lastTest*
    // fields + audit row), so it is NOT read-only and NOT concurrency-safe.
    metadata: { isReadOnly: false, isConcurrencySafe: false },
    tool: tool({
      description:
        'Runs a validation TEST of a custom integration (sends one real request using the stored credentials) and returns the result so you can narrate it to the user. Use this when the user asks to test or check whether an integration is working. Returns a coarse outcome and a plain-language pt-BR diagnosis — never credentials or response bodies.',
      inputSchema: z.object({
        integrationId: z
          .string()
          .describe('The id of the custom integration to test.'),
      }),
      execute: async (input) => {
        const { outcome, diagnosis } = await runIntegrationTest({
          organizationId: ctx.organizationId,
          integrationId: input.integrationId,
          requestedById: ctx.userId,
        })

        return { outcome, diagnosis }
      },
    }),
  })
}
