/**
 * NicheResearcher Sub-Agent — public barrel
 *
 * NOTE: intentionally NOT re-exported from `../index.ts` (the parent
 * sub-agents barrel) until the coordinator wires it in Phase C.
 */

export {
  nicheResearcherSubAgent,
  nicheResearcherInputSchema,
  parseNicheInsightsJSON,
  type NicheResearcherInput,
  type NicheInsights,
  type NicheInsightsSource,
} from './niche-researcher.sub-agent'

export {
  NICHE_SYNTHESIS_SYSTEM,
  buildSynthesisUserMessage,
} from './niche-researcher.prompt'

export {
  searchTavily,
  type TavilyResult,
  type TavilySearchItem,
  type SearchTavilyOptions,
} from './tavily-client'
