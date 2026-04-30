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
