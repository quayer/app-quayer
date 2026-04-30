/**
 * deploy-flow.orchestrator — test skeleton.
 *
 * Covers the happy path plus 3 failure-with-rollback paths. Use Vitest mocks
 * for Prisma + external services (uazapi) when filling these in — the saga
 * is pure TypeScript so full DB isn't required for unit coverage.
 */

import { describe, it } from 'vitest'

describe('executeDeployFlow', () => {
  describe('happy path', () => {
    it.todo(
      'creates BuilderDeployment, runs publish → instance → attach, marks status=live',
    )
    it.todo('persists versionNumber, publishedAt, instanceId, connectionId')
    it.todo(
      'executes in memory when BuilderDeployment delegate is missing (degrade gracefully)',
    )
  })

  describe('failure: publish_version throws', () => {
    it.todo('marks deployment status=failed with failureStep=publish_version')
    it.todo('invokes rollbackDeployment automatically')
    it.todo('does not call createDeployInstance or attachConnection')
  })

  describe('failure: create_instance throws', () => {
    it.todo('marks deployment status=failed with failureStep=create_instance')
    it.todo('invokes rollbackDeployment which runs unpublishVersion compensation')
    it.todo('does not call attachConnection')
  })

  describe('failure: attach_connection throws', () => {
    it.todo('marks deployment status=failed with failureStep=attach_connection')
    it.todo(
      'invokes rollbackDeployment which deletes Connection AND unsets publishedAt',
    )
  })

  describe('validation', () => {
    it.todo('throws when project is not found')
    it.todo('throws when project.aiAgentId is null (no agent bound yet)')
  })
})
