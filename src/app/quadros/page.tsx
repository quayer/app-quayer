'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/igniter.client'
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Pencil,
  PenTool,
} from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/client/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { Badge } from '@/client/components/ui/badge'
import { cn } from '@/lib/utils'

const FOLDER_LABELS: Record<string, string> = {
  scratch: 'Rascunhos',
  architecture: 'Arquitetura',
  product: 'Produto',
  marketing: 'Marketing',
  meetings: 'Reuniões',
}

export default function QuadrosPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeFolder, setActiveFolder] = useState<string | undefined>()
  const [newBoardName, setNewBoardName] = useState('')
  const [newBoardFolder, setNewBoardFolder] = useState('scratch')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['boards', search, activeFolder],
    queryFn: async () => {
      const response = await (api.boards.list as any).query({
        query: {
          search: search || undefined,
          folder: activeFolder,
          limit: 50,
        },
      })
      return response
    },
  })

  const createMutation = useMutation({
    mutationFn: async (input: { name: string; folder: string }) => {
      const response = await (api.boards.create as any).mutate({
        body: input,
      })
      return response
    },
    onSuccess: (result: any) => {
      setDialogOpen(false)
      setNewBoardName('')
      queryClient.invalidateQueries({ queryKey: ['boards'] })
      router.push(`/quadros/${result.data.id}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await (api.boards.delete as any).mutate({
        params: { id },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] })
    },
  })

  const boards = (data as any)?.data?.boards ?? []
  const folders = (data as any)?.data?.folders ?? []

  const handleCreate = () => {
    if (!newBoardName.trim()) return
    createMutation.mutate({
      name: newBoardName.trim(),
      folder: newBoardFolder,
    })
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quadros</h1>
          <p className="text-sm text-muted-foreground">
            Desenhe, planeje e colabore com quadros visuais
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Novo quadro
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar novo quadro</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-2">
              <Input
                placeholder="Nome do quadro"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <div className="flex flex-wrap gap-2">
                {Object.entries(FOLDER_LABELS).map(([key, label]) => (
                  <Badge
                    key={key}
                    variant={newBoardFolder === key ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setNewBoardFolder(key)}
                  >
                    {label}
                  </Badge>
                ))}
              </div>
              <Button
                onClick={handleCreate}
                disabled={!newBoardName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? 'Criando...' : 'Criar quadro'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar quadros..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          <Badge
            variant={!activeFolder ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setActiveFolder(undefined)}
          >
            Todos
          </Badge>
          {folders.map((folder: string) => (
            <Badge
              key={folder}
              variant={activeFolder === folder ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setActiveFolder(folder)}
            >
              {FOLDER_LABELS[folder] || folder}
            </Badge>
          ))}
        </div>
      </div>

      {/* Board Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/3] rounded-lg border border-border bg-muted/30 animate-pulse"
            />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <PenTool className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium">Nenhum quadro ainda</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Crie seu primeiro quadro para começar a desenhar
          </p>
          <Button
            size="sm"
            className="mt-4 gap-2"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Criar quadro
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {boards.map((board: any) => (
            <div
              key={board.id}
              className={cn(
                'group relative aspect-[4/3] rounded-lg border border-border',
                'bg-card hover:border-primary/50 hover:shadow-md',
                'transition-all cursor-pointer overflow-hidden'
              )}
              onClick={() => router.push(`/quadros/${board.id}`)}
            >
              {/* Thumbnail or placeholder */}
              {board.thumbnail ? (
                <img
                  src={board.thumbnail}
                  alt={board.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted/20">
                  <PenTool className="h-8 w-8 text-muted-foreground/30" />
                </div>
              )}

              {/* Info overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/90 to-transparent p-3 pt-8">
                <div className="flex items-end justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{board.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {FOLDER_LABELS[board.folder] || board.folder}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(board.updatedAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/quadros/${board.id}`)
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm('Deletar este quadro?')) {
                            deleteMutation.mutate(board.id)
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Deletar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
