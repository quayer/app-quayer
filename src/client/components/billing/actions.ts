'use server'

import { headers } from 'next/headers'
import { billingRepository } from '@/server/core/billing/billing.repository'
import { usageTracker } from '@/server/core/billing/services/usage-tracker.service'
import { getDatabase } from '@/server/services/database'

// ── Types ────────────────────────────────────────────────────────────────

export interface OrgBillingPlanSummary {
  id: string
  name: string
  slug: string
  description: string | null
  priceMonthly: number
  priceYearly: number | null
  maxUsers: number
  maxInstances: number
  maxMessages: number
  maxContacts: number
  maxStorage: number
  maxAiCredits: number
  hasWebhooks: boolean
  hasApi: boolean
  hasCustomRoles: boolean
  hasSso: boolean
  hasAiAgents: boolean
  hasPrioritySupport: boolean
  isFree: boolean
}

export interface OrgBillingSubscription {
  id: string
  planName: string
  planId: string
  planSlug: string
  status: string
  billingCycle: string
  paymentMethod: string
  nextBillingDate: string | null
  currentPriceCents: number
  isFree: boolean
}

export interface OrgBillingUsage {
  messagesUsed: number
  messagesLimit: number
  aiCreditsUsed: number
  aiCreditsLimit: number
  contactsCount: number
  contactsLimit: number
  storageUsedMb: number
  storageLimitMb: number
  period: string
}

export interface OrgBillingInvoice {
  id: string
  number: string
  amountCents: number
  status: string
  issuedAt: string
  dueDate: string
  paidAt: string | null
  pdfUrl: string | null
}

export interface OrgBillingPaymentMethod {
  kind: 'PIX_AUTO' | 'PIX_MANUAL' | 'CREDIT_CARD' | 'BOLETO' | 'NONE'
  label: string
  // Último 4 dígitos só existe se gateway gravar — por enquanto é stub.
  last4: string | null
}

export interface OrgBillingData {
  subscription: OrgBillingSubscription | null
  usage: OrgBillingUsage | null
  invoices: OrgBillingInvoice[]
  plans: OrgBillingPlanSummary[]
  paymentMethod: OrgBillingPaymentMethod
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function getOrgId(): Promise<string | null> {
  const h = await headers()
  return h.get('x-current-org-id')
}

const METHOD_LABELS: Record<string, string> = {
  PIX_AUTO: 'Pix Automático',
  PIX_MANUAL: 'Pix Manual',
  CREDIT_CARD: 'Cartão de Crédito',
  BOLETO: 'Boleto',
}

// ── Actions ──────────────────────────────────────────────────────────────

export async function getOrgBillingDataAction(): Promise<{
  success: boolean
  data?: OrgBillingData
  error?: string
}> {
  try {
    const orgId = await getOrgId()
    if (!orgId) {
      return { success: false, error: 'Organização ativa não encontrada.' }
    }

    const db = getDatabase()

    const [subscriptionRaw, plansRaw, invoicesResult, usageRaw] = await Promise.all([
      billingRepository.findCurrentSubscription(orgId),
      billingRepository.findAllPlans(),
      billingRepository.findInvoicesByOrg(orgId, { page: 1, limit: 12 }),
      usageTracker.getCurrentUsage(orgId),
    ])

    const plans: OrgBillingPlanSummary[] = plansRaw.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      maxUsers: p.maxUsers,
      maxInstances: p.maxInstances,
      maxMessages: p.maxMessages,
      maxContacts: p.maxContacts,
      maxStorage: p.maxStorage,
      maxAiCredits: p.maxAiCredits,
      hasWebhooks: p.hasWebhooks,
      hasApi: p.hasApi,
      hasCustomRoles: p.hasCustomRoles,
      hasSso: p.hasSso,
      hasAiAgents: p.hasAiAgents,
      hasPrioritySupport: p.hasPrioritySupport,
      isFree: p.isFree,
    }))

    let subscription: OrgBillingSubscription | null = null
    let usage: OrgBillingUsage | null = null
    let paymentMethod: OrgBillingPaymentMethod = {
      kind: 'NONE',
      label: 'Nenhum método cadastrado',
      last4: null,
    }

    if (subscriptionRaw) {
      subscription = {
        id: subscriptionRaw.id,
        planName: subscriptionRaw.plan?.name ?? 'Plano',
        planId: subscriptionRaw.planId,
        planSlug: subscriptionRaw.plan?.slug ?? '',
        status: subscriptionRaw.status,
        billingCycle: subscriptionRaw.billingCycle,
        paymentMethod: subscriptionRaw.paymentMethod ?? 'PIX_AUTO',
        nextBillingDate: subscriptionRaw.nextBillingDate?.toISOString() ?? null,
        currentPriceCents: subscriptionRaw.currentPriceCents,
        isFree: subscriptionRaw.plan?.isFree ?? false,
      }

      const kind = (subscriptionRaw.paymentMethod ?? 'PIX_AUTO') as OrgBillingPaymentMethod['kind']
      paymentMethod = {
        kind,
        label: METHOD_LABELS[kind] ?? kind,
        // TODO: hidratar com last4 real quando o gateway (Efí/Asaas) gravar o token.
        last4: null,
      }

      const plan = subscriptionRaw.plan
      if (plan) {
        // Count users for this org
        const usersCount = await db.userOrganization.count({
          where: { organizationId: orgId },
        }).catch(() => 0)

        usage = {
          messagesUsed: usageRaw.messagesUsed,
          messagesLimit: plan.maxMessages,
          aiCreditsUsed: usageRaw.aiCreditsUsed,
          aiCreditsLimit: plan.maxAiCredits,
          contactsCount: usersCount, // Builder pivot: "agentes ativos" = membros
          contactsLimit: plan.maxUsers,
          storageUsedMb: usageRaw.storageUsedMb,
          storageLimitMb: plan.maxStorage,
          period: usageRaw.period,
        }
      }
    }

    const invoices: OrgBillingInvoice[] = invoicesResult.data.map((inv) => ({
      id: inv.id,
      number: `INV-${String(inv.number).padStart(6, '0')}`,
      amountCents: inv.totalCents,
      status: inv.status,
      issuedAt: inv.issuedAt.toISOString(),
      dueDate: inv.dueDate.toISOString(),
      paidAt: inv.paidAt?.toISOString() ?? null,
      pdfUrl: inv.pdfUrl ?? null,
    }))

    return {
      success: true,
      data: {
        subscription,
        usage,
        invoices,
        plans,
        paymentMethod,
      },
    }
  } catch (error) {
    console.error('[Org Billing] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao carregar dados de cobrança.',
    }
  }
}
