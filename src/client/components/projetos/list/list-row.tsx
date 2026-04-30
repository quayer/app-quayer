"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/igniter.client"
import { TableCell, TableRow } from "@/client/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/client/components/ui/alert-dialog"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import {
  PROJECT_STATUS_LABEL,
  getProjectStatusStyle,
} from "@/lib/project-status"
import { getProjectTypeMeta } from "@/lib/project-type"
import type { ProjetoItem } from "./list-types"
import { formatRelative } from "./list-utils"

interface ListRowProps {
  project: ProjetoItem
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}

export function ListRow({ project, tokens }: ListRowProps) {
  const router = useRouter()
  const [archiveOpen, setArchiveOpen] = React.useState(false)
  const typeMeta = getProjectTypeMeta(project.type)
  const statusStyle = getProjectStatusStyle(project.status)
  const TypeIcon = typeMeta.icon

  const archiveMutation = api.builder.archiveProject.useMutation({
    onSuccess: () => {
      toast.success("Projeto arquivado")
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Erro ao arquivar projeto"
      toast.error(message)
    },
  })

  return (
    <TableRow
      key={project.id}
      className="cursor-pointer transition-colors"
      style={{ borderColor: tokens.divider }}
      onClick={() => router.push(`/projetos/${project.id}`)}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = tokens.hoverBg
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent"
      }}
    >
      <TableCell className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: tokens.brandSubtle,
              color: tokens.brand,
            }}
          >
            <TypeIcon className="h-4 w-4" />
          </div>
          <span
            className="truncate text-[14px] font-semibold"
            style={{ color: tokens.textPrimary }}
          >
            {project.name}
          </span>
        </div>
      </TableCell>
      <TableCell className="py-3.5">
        <span
          className="text-[13px]"
          style={{ color: tokens.textSecondary }}
        >
          {typeMeta.shortLabel}
        </span>
      </TableCell>
      <TableCell className="py-3.5">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: statusStyle.bg,
            color: statusStyle.color,
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: statusStyle.dot }}
          />
          {PROJECT_STATUS_LABEL[project.status]}
        </span>
      </TableCell>
      <TableCell className="py-3.5">
        <span
          className="text-[12px]"
          style={{ color: tokens.textTertiary }}
        >
          {formatRelative(project.updatedAt)}
        </span>
      </TableCell>
      <TableCell
        className="py-3.5 pr-4"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
              style={{ color: tokens.textTertiary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = tokens.hoverBg
                e.currentTarget.style.color = tokens.textPrimary
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent"
                e.currentTarget.style.color = tokens.textTertiary
              }}
              aria-label="Ações"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => router.push(`/projetos/${project.id}`)}
            >
              Abrir
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Renomear</DropdownMenuItem>
            <DropdownMenuItem disabled>Duplicar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setArchiveOpen(true)}
            >
              Arquivar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Arquivar projeto?</AlertDialogTitle>
              <AlertDialogDescription>
                O projeto <strong>{project.name}</strong> será arquivado e ficará
                oculto da lista principal. Você pode restaurá-lo a qualquer momento.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() =>
                  archiveMutation.mutate({ params: { id: project.id }, body: {} })
                }
              >
                Arquivar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  )
}
