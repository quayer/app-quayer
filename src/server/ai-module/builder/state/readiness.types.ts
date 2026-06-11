/**
 * Builder Module — Readiness / Step-Engine Types (Orayon Uplift, W2 foundation)
 *
 * Shared vocabulary for the deterministic step-engine that replaces the
 * "let the LLM read an 8-stage prose flow" approach. A single pure function
 * (`nextPendingStep`) consumes a `BuilderState` + live signals (`StepEngineContext`)
 * and emits a `Readiness` object that drives BOTH the system-prompt banner and
 * the UI progress — one source of truth.
 *
 * Dependency-light: only `BuilderState` (the canonical state) and the
 * `DeployRunnerBlockerCheck` union (so blockers speak the same language as the
 * deploy saga). No DB, no IO here — the resolver layer owns IO.
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (step-engine + 6 pre-deploy checks).
 */

import type { BuilderState } from '../cards/builder-state'
import type { DeployRunnerBlockerCheck } from '../sub-agents'

// ==========================================
// Step identity
// ==========================================

/**
 * Ordered journey steps the Builder walks the creator through. Lifted from the
 * 8-stage flow in `prompts/whatsapp-agent-system-prompt.ts`. The concrete
 * ordered list + per-step gating lives in `next-pending-step.ts` (QUAYER_STEPS);
 * this union is the type contract every layer references.
 *
 * The first block is the v1 (`journeyVersion: 1`) vocabulary. The second block
 * is **additive** — the Journey v2 ("Configure por exceção") step ids consumed
 * by `journey-v2.ts` (QUAYER_PHASES). Every consumer reads `StepId` via tolerant
 * lookups (`Partial<Record<StepId, …>>`, `as StepId`) — there is no exhaustive
 * `switch` over the union, so extending it is safe (risk R3, gate T78).
 */
export type StepId =
  // v1 step ids (next-pending-step.ts / QUAYER_STEPS)
  | 'project_identity'
  | 'objective'
  | 'source_ingestion'
  | 'persona'
  | 'services'
  | 'business_hours'
  | 'pricing'
  | 'handoff'
  | 'calendar'
  | 'activation'
  | 'silenced_contacts'
  | 'tools'
  | 'channel'
  | 'agent_approval'
  | 'summary'
  // v2 step ids (journey-v2.ts / QUAYER_PHASES) — additive
  | 'business_identity'
  | 'agent_review'
  | 'test_drive'
  | 'channel_platform'
  | 'whatsapp_connect'
  | 'instagram_connect'
  | 'published_next_steps'
  | 'knowledge'
  | 'media'

/** A step as surfaced in the progress checklist (UI + banner). */
export interface ReadinessStep {
  id: StepId
  title: string
  done: boolean
}

/**
 * The four Journey v2 phases ("Configure por exceção"), in order. Drives the
 * phased progress UI + the v2-aware banner ("Fase 2 de 4 — Revisar"). Only
 * populated for `journeyVersion: 2` projects (see `Readiness.journey`).
 */
export type PhaseId = 'conhecer' | 'revisar' | 'testar' | 'lancar'

// ==========================================
// Live signals (resolved server-side, never trusted from a request body)
// ==========================================

/**
 * Live, server-resolved signals the pure engine needs but cannot derive from
 * `BuilderState` alone. Every value is computed from the DB filtered by
 * `organizationId` (see `readiness-resolver.ts`). Booleans/counts only — the
 * engine must stay pure and synchronous.
 */
export interface StepEngineContext {
  /** Organization has a non-free `billingType` (plan blocker clears). */
  hasActivePlan: boolean
  /** Count of active BYOK AI providers (`OrganizationProvider`, category 'AI'). */
  byokProviderCount: number
  /** At least one WhatsApp `Connection` exists for the org (channel blocker clears). */
  hasWhatsAppInstance: boolean
  /** The project is bound to an `AIAgentConfig` (`BuilderProject.aiAgentId`). */
  agentExists: boolean
  /** Length of the bound agent's `systemPrompt` (0 when none) — prompt blocker. */
  promptLength: number
  /** Highest `BuilderPromptVersion.versionNumber` for the agent (null = none). */
  latestVersionNumber: number | null
}

// ==========================================
// Blockers — the 6 pre-deploy checks, typed
// ==========================================

/**
 * Reuses the deploy-runner's discriminated check vocabulary
 * (`agent | prompt | version | channel`) extended with the two tool-level
 * checks the publish flow owns (`plan | byok`). The 6 pre-deploy checks from
 * `whatsapp-agent-system-prompt.ts` map onto these.
 */
export type ReadinessBlockerCheck = DeployRunnerBlockerCheck | 'plan' | 'byok'

/** A single deploy blocker, with an actionable CTA + redirect for the UI. */
export interface ReadinessBlocker {
  check: ReadinessBlockerCheck
  message: string
  /** Short call-to-action label (e.g. "Conecte um canal WhatsApp"). */
  cta?: string
  /** Where to send the user to clear it (e.g. "/conta", "/integracoes"). */
  redirect?: string
}

// ==========================================
// Field ownership
// ==========================================

/**
 * Per-field ownership the journey banner uses to decide whether a value must
 * come from a card ('card') or can be typed free-form in chat ('livre').
 */
export type FieldOwnership = 'card' | 'livre'

// ==========================================
// Readiness — the engine's output (single source of truth)
// ==========================================

export interface Readiness {
  /** The next step the creator should complete (drives the prompt banner). */
  step: {
    id: StepId
    title: string
    /** Human ask to surface ("Qual o nome do projeto?"). */
    ask: string
  }
  /** Canonical field paths still missing for the current step. */
  requiredMissing: string[]
  /** 0-100, monotonic as steps complete. */
  completenessPct: number
  /** True only when every step is done AND every blocker is clear. */
  isDeployReady: boolean
  /** The 6 pre-deploy checks, as typed blockers (empty = clear). */
  blockers: ReadinessBlocker[]
  /** Field path → 'card' | 'livre' (journey banner uses this). */
  fieldOwnership: Record<string, FieldOwnership>
  /** Full ordered checklist for the UI progress view. */
  steps: ReadinessStep[]
  /**
   * The persisted (or defaulted) builder state, so the FE can pre-fill the
   * active-step card with already-confirmed values. Populated by the resolver
   * boundary (`getReadiness`); the pure `nextPendingStep` omits it.
   */
  builderState?: BuilderState
  /**
   * Phased journey view — populated ONLY for `journeyVersion: 2` projects (the
   * resolver's v2 branch). When present, the UI/banner render the 4-phase
   * "Configure por exceção" journey; the v1 fields above stay ALWAYS populated
   * for both versions (back-compat). Absent for v1.
   */
  journey?: {
    version: 2
    activePhaseId: PhaseId
    phases: Array<{
      id: PhaseId
      title: string
      steps: ReadinessStep[]
      status: 'done' | 'active' | 'pending'
    }>
  }
}
