/**
 * Deploy Contract — shared types for the Builder deploy saga.
 *
 * When a 2nd target (Instagram, etc) is added, move this to
 * `../targets/target.contract.ts` and parametrize DeployContext by target type.
 *
 * All handlers in `./` are framework-agnostic: they accept a DeployContext,
 * perform side-effects (DB + external APIs), and return a step-specific
 * payload. Orchestration + HTTP concerns live in deploy.routes.ts and
 * deploy-flow.orchestrator.ts respectively.
 */

export type DeployStatus =
  | 'pending'
  | 'publishing'
  | 'instance_creating'
  | 'attaching'
  | 'live'
  | 'failed'
  | 'rolled_back'

export type DeployStepName =
  | 'publish_version'
  | 'materialize_pricing'
  | 'materialize_team'
  | 'materialize_media'
  | 'materialize_knowledge'
  | 'create_instance'
  | 'attach_connection'

export interface DeployStep {
  /** Canonical step identifier (used to resume / report failures). */
  name: DeployStepName
  /** Execute the step. Must be idempotent — callers may retry after a crash. */
  run(ctx: DeployContext): Promise<Record<string, unknown>>
  /** Optional compensation for rollback.run order is reverse. */
  compensate?(ctx: DeployContext): Promise<void>
}

export interface DeployContext {
  /** BuilderDeployment.id if persistence succeeded; null if table missing. */
  deploymentId: string | null
  /** BuilderProject.id being deployed. */
  projectId: string
  /** BuilderPromptVersion.id to promote. */
  promptVersionId: string
  /** AIAgentConfig.id linked to the project (validated before orchestration). */
  aiAgentId: string
  /** Organization boundary. */
  organizationId: string
  /** User who triggered the deploy (audit trail). */
  userId: string
  /** Mutable state populated by previous steps. */
  state: {
    publishedAt?: Date
    versionNumber?: number
    instanceId?: string
    connectionId?: string
    /**
     * Light bookkeeping written by `materialize_pricing`. NOT persisted on the
     * BuilderDeployment row, so the rollback handler (which reconstructs the
     * context from that row) cannot rely on it — the compensation is therefore
     * self-contained (re-derives the list by `pricing:${projectId}` if needed).
     */
    pricing?: { listId: string }
    /**
     * Light bookkeeping written by `materialize_team`. Same semantics as
     * `pricing`: NOT persisted on the BuilderDeployment row, so the rollback
     * handler cannot rely on it — the compensation is a self-contained no-op
     * (the Department/members are the user's source of truth, re-derived by
     * `team:${projectId}` on the next deploy, never undone).
     */
    team?: { departmentId: string }
    /**
     * Light bookkeeping written by `materialize_media`. Same semantics as
     * `pricing`/`team`: NOT persisted on the BuilderDeployment row, so the
     * rollback handler cannot rely on it — the compensation is a self-contained
     * no-op (the media catalog is the user's source of truth, re-derived from the
     * gallery/pricing on the next deploy, never undone).
     */
    media?: { collectionId: string | null }
    /**
     * Light bookkeeping written by `materialize_knowledge`. Same semantics as the
     * others: NOT persisted on the BuilderDeployment row — the compensation is a
     * self-contained no-op (the RAG link reflects the user pasting a source; the
     * create_agent backfill is the primary net, this step is the redundant one).
     */
    knowledge?: { collectionId: string | null }
  }
}

export interface DeployResult {
  deploymentId: string | null
  status: DeployStatus
  projectId: string
  promptVersionId: string
  instanceId?: string
  connectionId?: string
  publishedAt?: Date
  versionNumber?: number
  failureStep?: DeployStepName
  failureReason?: string
  startedAt: Date
  completedAt?: Date
}

export interface RollbackResult {
  deploymentId: string
  rolledBack: boolean
  compensations: Array<{
    step: DeployStepName
    success: boolean
    error?: string
  }>
}
