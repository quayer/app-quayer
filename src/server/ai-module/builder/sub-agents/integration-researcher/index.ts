/**
 * IntegrationResearcher Sub-Agent — public barrel
 *
 * NOTE: intentionally NOT re-exported from `../index.ts` (the parent
 * sub-agents barrel) until `propose_integration` (T30) wires it in.
 */

export {
  runIntegrationResearcher,
  parseIntegrationBlueprintJSON,
  type RunIntegrationResearcherArgs,
  type IntegrationResearchOutcome,
} from './integration-researcher.sub-agent'

export {
  buildIntegrationResearcherPrompt,
  buildIntegrationSynthesisUserMessage,
  INTEGRATION_SYNTHESIS_SYSTEM,
  type IntegrationAuthType,
  type IntegrationBlueprint,
  type IntegrationEndpointBlueprint,
  type IntegrationCredentialBlueprint,
  type IntegrationResearcherSnippet,
  type IntegrationResearcherPrompt,
  type IntegrationResearcherPromptArgs,
} from './integration-researcher.prompt'
