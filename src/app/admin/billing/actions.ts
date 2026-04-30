'use server'

import { database } from '@/server/services/database'
import { requireAdmin, sanitizeError } from '../utils'

// ============================================================
// TYPES
// ============================================================

export interface BillingStats {
  mrr: number // centavos
  totalSubscribers: number
  churnRate: number
  pendingInvoices: number
}

export interface PlanCount {
  plan: string
  count: number
}

export interface RecentInvoice {
  id: string
  number: string
  orgName: string
  amount: number
  status: string
  date: string
}

export interface AdminSubscription {
  id: string
  orgName: string
  plan: string
  status: string
  paymentMethod: string
  nextBilling: string | null
}

export interface AdminInvoice {
  id: string
  number: string
  orgName: string
  amount: number
  status: string
  date: string
  nfseStatus: string
  pdfUrl: string | null
  nfseUrl: string | null
}

// ============================================================
// ACTIONS
// ============================================================

export async function getAdminBillingStatsAction(): Promise<{
  success: boolean
  data?: { stats: BillingStats; planCounts: PlanCount[] }
  error?: string
}> {
  try {
    await requireAdmin()

    // Fetch real subscriptions with their plans
    const subscriptions = await database.subscription.findMany({
      where: { isCurrent: true, status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] } },
      include: { plan: true },
    })

    // Calculate MRR from real subscription prices
    let mrr = 0
    const planMap: Record<string, number> = {}

    for (const sub of subscriptions) {
      const planName = sub.plan?.name || 'Free'
      planMap[planName] = (planMap[planName] || 0) + 1

      if (sub.currentPriceCents > 0) {
        // Normalize to monthly for MRR calculation
        if (sub.billingCycle === 'YEARLY') {
          mrr += Math.round(sub.currentPriceCents / 12)
        } else if (sub.billingCycle === 'QUARTERLY') {
          mrr += Math.round(sub.currentPriceCents / 3)
        } else {
          mrr += sub.currentPriceCents
        }
      }
    }

    const paidCount = subscriptions.filter((s) => s.currentPriceCents > 0).length

    const planCounts: PlanCount[] = Object.entries(planMap)
      .map(([plan, count]) => ({ plan, count }))
      .sort((a, b) => b.count - a.count)

    // Count orgs on free tier (no active subscription)
    const totalOrgsWithSub = await database.subscription.groupBy({
      by: ['organizationId'],
      where: { isCurrent: true, status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] } },
    })
    const totalOrgs = await database.organization.count({ where: { isActive: true } })
    const freeCount = totalOrgs - totalOrgsWithSub.length
    if (freeCount > 0) {
      planCounts.push({ plan: 'Free', count: freeCount })
      planCounts.sort((a, b) => b.count - a.count)
    }

    // Count pending invoices from real invoice table
    const pendingInvoices = await database.invoice.count({
      where: { status: { in: ['PENDING', 'PROCESSING', 'OVERDUE'] } },
    })

    // Calculate churn rate from canceled subscriptions in the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const canceledLastMonth = await database.subscription.count({
      where: {
        status: 'CANCELED',
        canceledAt: { gte: thirtyDaysAgo },
      },
    })
    const totalActiveAtStartOfPeriod = paidCount + canceledLastMonth
    const churnRate = totalActiveAtStartOfPeriod > 0
      ? Math.round((canceledLastMonth / totalActiveAtStartOfPeriod) * 100 * 10) / 10
      : 0

    return {
      success: true,
      data: {
        stats: {
          mrr,
          totalSubscribers: paidCount,
          churnRate,
          pendingInvoices,
        },
        planCounts,
      },
    }
  } catch (error) {
    console.error('[Admin Billing] Error getting stats:', error)
    return { success: false, error: sanitizeError(error) }
  }
}

export async function getAdminRecentInvoicesAction(): Promise<{
  success: boolean
  data: RecentInvoice[]
  error?: string
}> {
  try {
    await requireAdmin()

    // Fetch real recent invoices from the database
    const invoices = await database.invoice.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        organization: { select: { name: true } },
      },
    })

    const data: RecentInvoice[] = invoices.map((inv) => ({
      id: inv.id,
      number: inv.number ? `INV-${String(inv.number).padStart(6, '0')}` : `INV-${inv.id.slice(0, 8).toUpperCase()}`,
      orgName: inv.organization?.name || 'N/A',
      amount: inv.totalCents,
      status: inv.status,
      date: (inv.issuedAt || inv.createdAt).toISOString(),
    }))

    return { success: true, data }
  } catch (error) {
    console.error('[Admin Billing] Error getting recent invoices:', error)
    return { success: false, data: [], error: sanitizeError(error) }
  }
}

export async function getAdminSubscriptionsAction(): Promise<{
  success: boolean
  data: AdminSubscription[]
  error?: string
}> {
  try {
    await requireAdmin()

    // Fetch real subscriptions from the database
    const subscriptions = await database.subscription.findMany({
      where: { isCurrent: true },
      include: {
        plan: { select: { name: true } },
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const data: AdminSubscription[] = subscriptions.map((sub) => {
      const methodLabels: Record<string, string> = {
        PIX_AUTO: 'PIX Auto',
        PIX_MANUAL: 'PIX Manual',
        CREDIT_CARD: 'Cartao',
        BOLETO: 'Boleto',
      }

      return {
        id: sub.id,
        orgName: sub.organization?.name || 'N/A',
        plan: sub.plan?.name || 'Free',
        status: sub.status.toLowerCase(),
        paymentMethod: methodLabels[sub.paymentMethod ?? ''] || sub.paymentMethod || '-',
        nextBilling: sub.nextBillingDate ? sub.nextBillingDate.toISOString() : null,
      }
    })

    return { success: true, data }
  } catch (error) {
    console.error('[Admin Billing] Error getting subscriptions:', error)
    return { success: false, data: [], error: sanitizeError(error) }
  }
}

export async function getAdminAllInvoicesAction(): Promise<{
  success: boolean
  data: AdminInvoice[]
  error?: string
}> {
  try {
    await requireAdmin()

    // Fetch all invoices from the database
    const invoices = await database.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        organization: { select: { name: true } },
      },
    })

    const data: AdminInvoice[] = invoices.map((inv) => ({
      id: inv.id,
      number: inv.number ? `INV-${String(inv.number).padStart(6, '0')}` : `INV-${inv.id.slice(0, 8).toUpperCase()}`,
      orgName: inv.organization?.name || 'N/A',
      amount: inv.totalCents,
      status: inv.status,
      date: (inv.issuedAt || inv.createdAt).toISOString(),
      nfseStatus: inv.nfseStatus || 'N/A',
      pdfUrl: inv.pdfUrl || null,
      nfseUrl: inv.nfseUrl || null,
    }))

    return { success: true, data }
  } catch (error) {
    console.error('[Admin Billing] Error getting all invoices:', error)
    return { success: false, data: [], error: sanitizeError(error) }
  }
}
