'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/igniter.client'
import {
  Zap,
  Plus,
  Search,
  Pencil,
  Trash2,
  Copy,
  Check,
  Loader2,
  Hash,
  MessageSquare,
  TrendingUp,
  Filter,
  MoreVertical,
  AlertCircle,
} from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface QuickReply {
  id: string
  shortcut: string
  title: string
  content: string
  category: string | null
  isGlobal: boolean
  isActive: boolean
  usageCount: number
  createdAt: string
  updatedAt: string
  createdBy?: {
    id: string
    name: string
    email: string
  }
}

export default function RespostasRapidasPage() {
  const queryClient = useQueryClient()
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null)
  const [deleteReply, setDeleteReply] = useState<QuickReply | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    shortcut: '',
    title: '',
    content: '',
    category: '',
    isGlobal: true,
  })

  // Fetch quick replies
  const { data, isLoading, error } = useQuery({
    queryKey: ['quick-replies-management'],
    queryFn: async () => {
      try {
        const response = await (api['quick-replies'] as any).list.query({
          query: { limit: 100 }
        })

        // Handle different response formats from Igniter
        // Format 1: { data: { data: { quickReplies, categories } } }
        // Format 2: { data: { quickReplies, categories } }
        // Format 3: { quickReplies, categories }
        const raw = response as any
        let result = raw

        // Unwrap nested data
        if (result?.data) result = result.data
        if (result?.data) result = result.data

        // Validate and extract
        const quickReplies = Array.isArray(result?.quickReplies) ? result.quickReplies : []
        const categories = Array.isArray(result?.categories) ? result.categories : []

        console.log('[QuickReplies] Loaded:', { count: quickReplies.length, categories: categories.length })

        return { quickReplies, categories }
      } catch (err: any) {
        console.error('[QuickReplies] Error fetching:', err?.message || err)
        return { quickReplies: [], categories: [] }
      }
    },
  })

  const quickReplies: QuickReply[] = data?.quickReplies ?? []
  const categories: string[] = data?.categories ?? []

  // Filter quick replies
  const filteredReplies = useMemo(() => {
    return quickReplies.filter((qr) => {
      const matchesSearch =
        !searchText ||
        qr.shortcut.toLowerCase().includes(searchText.toLowerCase()) ||
        qr.title.toLowerCase().includes(searchText.toLowerCase()) ||
        qr.content.toLowerCase().includes(searchText.toLowerCase())

      const matchesCategory =
        categoryFilter === 'all' ||
        (categoryFilter === 'uncategorized' && !qr.category) ||
        qr.category === categoryFilter

      return matchesSearch && matchesCategory
    })
  }, [quickReplies, searchText, categoryFilter])

  // Helper to extract error message safely
  const getErrorMessage = (error: unknown, fallback: string): string => {
    if (typeof error === 'string') return error
    if (error instanceof Error) return error.message
    if (error && typeof error === 'object') {
      const err = error as any
      // Handle Igniter error format
      if (typeof err.message === 'string') return err.message
      if (err.data && typeof err.data.message === 'string') return err.data.message
      if (err.error && typeof err.error === 'string') return err.error
    }
    return fallback
  }

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await (api['quick-replies'] as any).create.mutate({
        body: {
          shortcut: data.shortcut.startsWith('/') ? data.shortcut : `/${data.shortcut}`,
          title: data.title,
          content: data.content,
          category: data.category || undefined,
          isGlobal: data.isGlobal,
        }
      })
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies-management'] })
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] })
      setIsCreateOpen(false)
      resetForm()
      toast.success('Resposta rápida criada com sucesso!')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Erro ao criar resposta rápida'))
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const response = await (api['quick-replies'] as any).update.mutate({
        params: { id },
        body: {
          shortcut: data.shortcut?.startsWith('/') ? data.shortcut : `/${data.shortcut}`,
          title: data.title,
          content: data.content,
          category: data.category || null,
          isGlobal: data.isGlobal,
        }
      })
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies-management'] })
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] })
      setEditingReply(null)
      resetForm()
      toast.success('Resposta rápida atualizada!')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Erro ao atualizar resposta rápida'))
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await (api['quick-replies'] as any).delete.mutate({
        params: { id }
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies-management'] })
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] })
      setDeleteReply(null)
      toast.success('Resposta rápida excluída!')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Erro ao excluir resposta rápida'))
    },
  })

  const resetForm = () => {
    setFormData({
      shortcut: '',
      title: '',
      content: '',
      category: '',
      isGlobal: true,
    })
  }

  const handleEdit = (qr: QuickReply) => {
    setFormData({
      shortcut: qr.shortcut,
      title: qr.title,
      content: qr.content,
      category: qr.category || '',
      isGlobal: qr.isGlobal,
    })
    setEditingReply(qr)
  }

  const handleCopyShortcut = (shortcut: string, id: string) => {
    navigator.clipboard.writeText(shortcut)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    toast.success('Atalho copiado!')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingReply) {
      updateMutation.mutate({ id: editingReply.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  // Stats
  const totalReplies = quickReplies.length
  const totalUsage = quickReplies.reduce((sum, qr) => sum + qr.usageCount, 0)
  const mostUsed = quickReplies.reduce((max, qr) =>
    qr.usageCount > (max?.usageCount || 0) ? qr : max,
    null as QuickReply | null
  )

  return (
    <>
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/ferramentas">Ferramentas</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Respostas Rápidas</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
        {/* Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Zap className="h-6 w-6 text-yellow-500" />
              Respostas Rápidas
            </h1>
            <p className="text-muted-foreground">
              Crie atalhos para enviar mensagens rapidamente. Digite <code className="px-1.5 py-0.5 bg-muted rounded text-sm">/atalho</code> no chat.
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setIsCreateOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Resposta
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Criar Resposta Rápida</DialogTitle>
                  <DialogDescription>
                    Crie um atalho para enviar mensagens rapidamente no chat.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="shortcut">Atalho</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">/</span>
                      <Input
                        id="shortcut"
                        placeholder="ola"
                        className="pl-7 font-mono"
                        value={formData.shortcut.replace(/^\//, '')}
                        onChange={(e) => setFormData({ ...formData, shortcut: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                        required
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Apenas letras minúsculas, números e underscore
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="title">Título</Label>
                    <Input
                      id="title"
                      placeholder="Saudação inicial"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="content">Conteúdo da mensagem</Label>
                    <Textarea
                      id="content"
                      placeholder="Olá! Como posso ajudar você hoje?"
                      rows={4}
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="category">Categoria (opcional)</Label>
                    <Input
                      id="category"
                      placeholder="Saudações"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isGlobal">Disponível para toda equipe</Label>
                      <p className="text-xs text-muted-foreground">
                        Se desativado, apenas você poderá usar este atalho
                      </p>
                    </div>
                    <Switch
                      id="isGlobal"
                      checked={formData.isGlobal}
                      onCheckedChange={(checked) => setFormData({ ...formData, isGlobal: checked })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Criar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Atalhos</CardTitle>
              <Hash className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalReplies}</div>
              <p className="text-xs text-muted-foreground">
                {categories.length} categorias
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Usos</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsage}</div>
              <p className="text-xs text-muted-foreground">
                Mensagens enviadas via atalhos
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Mais Usado</CardTitle>
              <Zap className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {mostUsed?.shortcut || '-'}
              </div>
              <p className="text-xs text-muted-foreground">
                {mostUsed ? `${mostUsed.usageCount} usos` : 'Nenhum uso ainda'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar atalhos..."
              className="pl-10"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              <SelectItem value="uncategorized">Sem categoria</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Quick Replies List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 py-6">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-destructive">Erro ao carregar respostas rápidas</p>
            </CardContent>
          </Card>
        ) : filteredReplies.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">
                {searchText || categoryFilter !== 'all'
                  ? 'Nenhuma resposta encontrada'
                  : 'Nenhuma resposta rápida'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchText || categoryFilter !== 'all'
                  ? 'Tente ajustar os filtros'
                  : 'Crie sua primeira resposta rápida para agilizar o atendimento'}
              </p>
              {!searchText && categoryFilter === 'all' && (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Resposta
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredReplies.map((qr) => (
              <Card key={qr.id} className="group hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopyShortcut(qr.shortcut, qr.id)}
                        className="font-mono text-lg font-bold text-primary hover:underline flex items-center gap-1"
                      >
                        {qr.shortcut}
                        {copiedId === qr.id ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 opacity-0 group-hover:opacity-50" />
                        )}
                      </button>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(qr)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleCopyShortcut(qr.shortcut, qr.id)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copiar atalho
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteReply(qr)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardTitle className="text-base">{qr.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {qr.content}
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {qr.category && (
                        <Badge variant="outline">{qr.category}</Badge>
                      )}
                      {qr.isGlobal ? (
                        <Badge variant="secondary">Equipe</Badge>
                      ) : (
                        <Badge variant="outline">Pessoal</Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground">
                      {qr.usageCount} {qr.usageCount === 1 ? 'uso' : 'usos'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingReply} onOpenChange={(open) => !open && setEditingReply(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Editar Resposta Rápida</DialogTitle>
              <DialogDescription>
                Atualize as informações do atalho.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-shortcut">Atalho</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">/</span>
                  <Input
                    id="edit-shortcut"
                    placeholder="ola"
                    className="pl-7 font-mono"
                    value={formData.shortcut.replace(/^\//, '')}
                    onChange={(e) => setFormData({ ...formData, shortcut: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-title">Título</Label>
                <Input
                  id="edit-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-content">Conteúdo da mensagem</Label>
                <Textarea
                  id="edit-content"
                  rows={4}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-category">Categoria</Label>
                <Input
                  id="edit-category"
                  placeholder="Saudações"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="edit-isGlobal">Disponível para toda equipe</Label>
                  <p className="text-xs text-muted-foreground">
                    Se desativado, apenas você poderá usar este atalho
                  </p>
                </div>
                <Switch
                  id="edit-isGlobal"
                  checked={formData.isGlobal}
                  onCheckedChange={(checked) => setFormData({ ...formData, isGlobal: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingReply(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteReply} onOpenChange={(open) => !open && setDeleteReply(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir resposta rápida?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o atalho <code className="px-1.5 py-0.5 bg-muted rounded font-mono">{deleteReply?.shortcut}</code>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteReply && deleteMutation.mutate(deleteReply.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
