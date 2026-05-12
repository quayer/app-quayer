"use client"

import { Users, MailPlus, Clock } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { Button } from "@/client/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/client/components/ui/tooltip"
import {
  Pill,
  SectionCard,
  formatDate,
  roleLabel,
  timeAgo,
} from "@/client/components/org/team-list-shared"

export interface TeamMember {
  id: string
  userId: string
  name: string
  email: string
  membershipRole: string
  systemRole: string
  emailVerified: boolean
  joinedAt: string
}

export interface TeamInvitation {
  id: string
  email: string
  role: string
  expiresAt: string
  createdAt: string
}

export function TeamList({
  members,
  invitations,
}: {
  members: TeamMember[]
  invitations: TeamInvitation[]
}) {
  const { tokens } = useAppTokens()

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}
            >
              <Users className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <h1
                className="text-xl font-semibold tracking-tight"
                style={{ color: tokens.textPrimary }}
              >
                Equipe
              </h1>
              <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
                Membros e convites pendentes da organização.
              </p>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button disabled className="gap-2">
                  <MailPlus className="h-4 w-4" />
                  Convidar
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Em breve</TooltipContent>
          </Tooltip>
        </div>

        {/* Active members */}
        <SectionCard title="Membros ativos" count={members.length} tokens={tokens}>
          {members.length === 0 ? (
            <p className="text-[13px]" style={{ color: tokens.textTertiary }}>
              Nenhum membro cadastrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Verificação</TableHead>
                  <TableHead>Entrou em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium" style={{ color: tokens.textPrimary }}>
                      {m.name}
                    </TableCell>
                    <TableCell style={{ color: tokens.textSecondary }}>{m.email}</TableCell>
                    <TableCell>
                      <Pill tokens={tokens} tone="brand">
                        {roleLabel(m.membershipRole)}
                      </Pill>
                    </TableCell>
                    <TableCell>
                      <Pill tokens={tokens} tone={m.emailVerified ? "success" : "muted"}>
                        {m.emailVerified ? "Verificado" : "Pendente"}
                      </Pill>
                    </TableCell>
                    <TableCell style={{ color: tokens.textTertiary }}>
                      {formatDate(m.joinedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        {/* Pending invitations */}
        {invitations.length > 0 ? (
          <SectionCard
            title="Convites pendentes"
            count={invitations.length}
            tokens={tokens}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Expira</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium" style={{ color: tokens.textPrimary }}>
                      {inv.email}
                    </TableCell>
                    <TableCell>
                      <Pill tokens={tokens} tone="neutral">
                        {roleLabel(inv.role)}
                      </Pill>
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-1.5 text-[12px]"
                        style={{ color: tokens.textTertiary }}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {timeAgo(inv.expiresAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        ) : null}
      </div>
    </TooltipProvider>
  )
}
