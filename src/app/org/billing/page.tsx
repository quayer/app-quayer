import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"

import { getDatabase } from "@/server/services/database"
import { PlanCard, type PlanTier } from "@/client/components/org/billing/plan-card"
import { UsageMeter } from "@/client/components/org/billing/usage-meter"

export const metadata: Metadata = {
  title: "Plano & Uso | Quayer",
}

export const dynamic = "force-dynamic"

const PLAN_META: Record<PlanTier, { label: string; description: string }> = {
  free: { label: "Free", description: "Para experimentar a plataforma" },
  basic: { label: "Basic", description: "Para times pequenos" },
  pro: { label: "Pro", description: "Para operações em escala" },
}

function normalizeTier(billingType: string | null | undefined): PlanTier {
  if (billingType === "basic" || billingType === "pro") {
    return billingType
  }
  return "free"
}

export default async function OrgBillingPage() {
  // Middleware injects these after JWT verification (see middleware.ts).
  const headersList = await headers()
  const userId = headersList.get("x-user-id")
  const orgId = headersList.get("x-current-org-id")

  if (!userId) {
    redirect("/login")
  }
  if (!orgId) {
    redirect("/")
  }

  const db = getDatabase()

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      maxInstances: true,
      maxUsers: true,
      billingType: true,
    },
  })

  if (!org) {
    redirect("/")
  }

  const [connectionsCount, usersCount] = await Promise.all([
    db.connection.count({ where: { organizationId: orgId } }),
    db.userOrganization.count({
      where: { organizationId: orgId, isActive: true },
    }),
  ])

  const tier = normalizeTier(org.billingType)
  const meta = PLAN_META[tier]

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Plano & Uso</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe seu plano atual e o consumo da organização{" "}
          <span className="font-medium">{org.name}</span>.
        </p>
      </header>

      <PlanCard tier={tier} label={meta.label} description={meta.description} />

      <section
        aria-label="Uso da organização"
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <UsageMeter
          label="Canais conectados"
          unit="canais"
          current={connectionsCount}
          max={org.maxInstances}
        />
        <UsageMeter
          label="Membros da equipe"
          unit="usuários"
          current={usersCount}
          max={org.maxUsers}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PlaceholderCard
          title="Histórico de pagamentos"
          message="Em breve você verá aqui suas faturas e recibos."
        />
        <PlaceholderCard
          title="Método de pagamento"
          message="Em breve você poderá cadastrar e gerenciar seu método de pagamento."
        />
      </section>
    </main>
  )
}

interface PlaceholderCardProps {
  title: string
  message: string
}

function PlaceholderCard({ title, message }: PlaceholderCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-xs text-muted-foreground">{message}</p>
      <p className="mt-4 inline-flex rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        Em breve
      </p>
    </div>
  )
}
