/**
 * attachConnectionToProjectAgent — liga uma Connection ao agente do projeto via
 * AgentDeployment ACTIVE (mesma lógica de attachChannel). Sem isso,
 * getProjectChannel / hasWhatsAppConnection e o checklist de deploy não
 * reconhecem o canal. No-op se o projeto ainda não tem agente.
 *
 * Compartilhado por channel-credentials.routes (Cloud/Instagram) e
 * provision-whatsapp.routes (WhatsApp Business via UAZAPI).
 */

import { getDatabase } from '@/server/services/database'

export async function attachConnectionToProjectAgent(
  db: ReturnType<typeof getDatabase>,
  projectId: string,
  connectionId: string,
  organizationId: string,
): Promise<void> {
  const project = await db.builderProject.findFirst({
    where: { id: projectId, organizationId },
    select: { aiAgentId: true },
  })
  if (!project?.aiAgentId) return

  // Multi-canal (plan §3.7): pausa SÓ deployments ACTIVE da MESMA conexão
  // (re-attach daquele canal). Sem o filtro connectionId, anexar um segundo
  // canal (ex.: Instagram) pausaria o WhatsApp do mesmo agente. Com ele, o
  // agente pode ter N deployments ACTIVE — 1 por conexão/canal simultâneo.
  await db.agentDeployment.updateMany({
    where: { agentConfigId: project.aiAgentId, connectionId, status: 'ACTIVE' },
    data: { status: 'PAUSED', updatedAt: new Date() },
  })

  const existing = await db.agentDeployment.findFirst({
    where: { agentConfigId: project.aiAgentId, connectionId },
    select: { id: true },
  })

  if (existing) {
    await db.agentDeployment.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', updatedAt: new Date() },
    })
  } else {
    await db.agentDeployment.create({
      data: {
        agentConfigId: project.aiAgentId,
        connectionId,
        mode: 'CHAT',
        status: 'ACTIVE',
      },
    })
  }
}
