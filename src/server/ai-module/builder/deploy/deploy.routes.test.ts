/**
 * deploy.routes — test skeleton.
 *
 * Bodies are `it.todo` so this file registers scenarios with the runner
 * without asserting any behavior yet. Fill in with Vitest + supertest (or
 * the project's igniter route harness) when the saga stabilizes.
 */

import { describe, it } from 'vitest'

describe('deploy.routes', () => {
  describe('POST /deploy/publish', () => {
    it.todo('rejects unauthenticated requests with 401')
    it.todo('rejects requests without an active organization with 400')
    it.todo('rejects body missing projectId or promptVersionId with 400')
    it.todo('invokes the orchestrator and returns deploymentId on success')
    it.todo('returns 400 with error message when the orchestrator throws')
  })

  describe('GET /deploy/:projectId/status', () => {
    it.todo('returns null when no deployment exists for the project')
    it.todo('returns latest deployment + step-by-step progress array')
    it.todo('degrades gracefully when BuilderDeployment table is missing')
  })

  describe('POST /deploy/:deploymentId/rollback', () => {
    it.todo('forbids non-admin users with 403')
    it.todo('returns 404 when the deployment table is not provisioned')
    it.todo('invokes rollback handler and returns compensations array')
  })
})
