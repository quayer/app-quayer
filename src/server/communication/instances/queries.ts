/**
 * Instances — Shared Data-Access Layer
 *
 * Used by Server Components (`/canais`) to fetch instances server-side,
 * same pattern as src/server/ai-module/builder/queries.ts.
 */

import { getDatabase } from '@/server/services/database'

export async function listOrgInstances(organizationId: string) {
  const db = getDatabase()
  try {
    const instances = await db.connection.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    })

    if (instances.length === 0) return []

    const instanceIds = instances.map((i) => i.id)
    const deployments = await db.builderDeployment.findMany({
      where: {
        connectionId: { in: instanceIds },
        status: 'live',
      },
      select: {
        connectionId: true,
        project: { select: { id: true, name: true, status: true } },
      },
    })

    const byConnection = new Map<string, Array<{ id: string; name: string; status: string }>>()
    for (const d of deployments) {
      if (!d.connectionId) continue
      if (!byConnection.has(d.connectionId)) byConnection.set(d.connectionId, [])
      byConnection.get(d.connectionId)!.push(d.project)
    }

    return instances.map((i) => ({
      ...i,
      connectedProjects: byConnection.get(i.id) ?? [],
    }))
  } catch (err) {
    console.warn('[instances/queries] listOrgInstances failed:', err)
    return []
  }
}

export type OrgInstance = Awaited<ReturnType<typeof listOrgInstances>>[number]
