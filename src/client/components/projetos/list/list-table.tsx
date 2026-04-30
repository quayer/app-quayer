"use client"

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type { ProjetoItem } from "./list-types"
import { ListRow } from "./list-row"

interface ListTableProps {
  projects: ProjetoItem[]
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}

export function ListTable({ projects, tokens }: ListTableProps) {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
      }}
    >
      <Table>
        <TableHeader>
          <TableRow
            className="hover:bg-transparent"
            style={{ borderColor: tokens.divider }}
          >
            <TableHead
              className="h-11 px-4 text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: tokens.textTertiary }}
            >
              Nome
            </TableHead>
            <TableHead
              className="h-11 text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: tokens.textTertiary }}
            >
              Tipo
            </TableHead>
            <TableHead
              className="h-11 text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: tokens.textTertiary }}
            >
              Status
            </TableHead>
            <TableHead
              className="h-11 text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: tokens.textTertiary }}
            >
              Atualizado
            </TableHead>
            <TableHead className="h-11 w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <ListRow key={project.id} project={project} tokens={tokens} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
