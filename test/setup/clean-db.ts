import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Limpa o banco de dados de teste respeitando foreign keys.
 * Ordem: dependentes primeiro, depois tabelas pai.
 *
 * Usa $transaction sequencial para atomicidade.
 * Usa PrismaPg adapter (consistente com src/server/services/database.ts).
 */
export async function cleanDatabase() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  console.log('Limpando banco de dados...')

  try {
    await prisma.$transaction([
      // ── Deepest dependents (no children) ──────────────────────────

      // Webhooks & Events
      prisma.webhookDelivery.deleteMany(),
      prisma.webhookEvent.deleteMany(),

      // Notifications
      prisma.notificationRead.deleteMany(),

      // Audit & Logs
      prisma.auditLog.deleteMany(),
      prisma.logAnalysis.deleteMany(),
      prisma.logEntry.deleteMany(),

      // Short Links
      prisma.shortLinkClick.deleteMany(),
      prisma.shortLink.deleteMany(),

      // Campaigns
      prisma.campaignRecipient.deleteMany(),
      prisma.campaign.deleteMany(),

      // Message Templates
      prisma.messageTemplate.deleteMany(),

      // ── Communication children ────────────────────────────────────

      // Messages
      prisma.message.deleteMany(),

      // ── AI Agent children (before AIAgentConfig) ──────────────────

      prisma.agentDeployment.deleteMany(),
      prisma.agentPromptVersion.deleteMany(),
      prisma.agentTool.deleteMany(),

      // ── Mid-level tables ──────────────────────────────────────────

      // Sessions & Chat (after their children are gone)
      prisma.chatSession.deleteMany(),

      // Connection dependents (after chatSession, message, etc.)
      prisma.connectionEvent.deleteMany(),
      prisma.connectionSettings.deleteMany(),

      // Files
      prisma.file.deleteMany(),

      // Webhooks (after deliveries)
      prisma.webhook.deleteMany(),

      // Notifications (after reads)
      prisma.notification.deleteMany(),

      // AI Agent Config (after deployments, promptVersions, chatSession)
      prisma.aIAgentConfig.deleteMany(),

      // Connections (after chatSession, message, connectionEvent, etc.)
      prisma.connection.deleteMany(),

      // ── Auth & Sessions ───────────────────────────────────────────

      prisma.deviceSession.deleteMany(),
      prisma.session.deleteMany(),
      prisma.refreshToken.deleteMany(),
      prisma.recoveryCode.deleteMany(),
      prisma.totpDevice.deleteMany(),
      prisma.passkeyCredential.deleteMany(),
      prisma.passkeyChallenge.deleteMany(),
      prisma.verificationCode.deleteMany(),
      prisma.apiKey.deleteMany(),
      prisma.scimToken.deleteMany(),

      // ── Org-level dependents ──────────────────────────────────────

      prisma.rolePermission.deleteMany(),
      prisma.permissionResource.deleteMany(),
      prisma.customRole.deleteMany(),
      prisma.invitation.deleteMany(),
      prisma.ipRule.deleteMany(),
      prisma.verifiedDomain.deleteMany(),
      prisma.userOrganization.deleteMany(),
      prisma.organizationProvider.deleteMany(),
      prisma.integrationConfig.deleteMany(),

      // Billing (Invoice refs Subscription; UsageRecord refs Organization)
      prisma.invoice.deleteMany(),
      prisma.subscription.deleteMany(),
      prisma.usageRecord.deleteMany(),

      // ── System-level ──────────────────────────────────────────────

      prisma.systemSettings.deleteMany(),
      prisma.emailTemplate.deleteMany(),
      prisma.aIPrompt.deleteMany(),

      // ── Projects & Departments ────────────────────────────────────

      prisma.project.deleteMany(),
      prisma.department.deleteMany(),

      // ── Core entities (parents — delete last) ─────────────────────

      prisma.userPreferences.deleteMany(),
      prisma.tempUser.deleteMany(),
      prisma.plan.deleteMany(),
      prisma.user.deleteMany(),
      prisma.organization.deleteMany(),
    ])

    console.log('Banco de dados limpo com sucesso!')
  } catch (error) {
    console.error('Erro ao limpar banco:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Auto-run when executed directly (tsx test/setup/clean-db.ts)
const isDirectRun = process.argv[1]?.includes('clean-db')
if (isDirectRun) {
  cleanDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}
