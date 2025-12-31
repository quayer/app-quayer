'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Mail, Eye, EyeOff, Save, RefreshCw, CheckCircle2, XCircle, Info,
  Pencil, Code2, FileText, RotateCcw, Monitor
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { TiptapEditor } from '@/components/editor'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { api, getAuthHeaders, getAuthToken } from '@/igniter.client'
import { getEnvDefaultsAction } from '@/app/admin/actions'

interface EnvEmailDefaults {
  provider: string
  from: string
  fromName: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPasswordMasked: string
}

interface EmailSettingsData {
  provider: 'mock' | 'resend' | 'smtp'
  from: string
  resendApiKey?: string
  smtp?: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
  }
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  htmlContent: string
  textContent?: string
  variables: string[]
  isActive: boolean
}

export function EmailSettings() {
  const queryClient = useQueryClient()
  const [showApiKey, setShowApiKey] = useState(false)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false)
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false)
  const [previewingTemplate, setPreviewingTemplate] = useState<EmailTemplate | null>(null)
  const [envDefaults, setEnvDefaults] = useState<EnvEmailDefaults | null>(null)

  const [formData, setFormData] = useState<EmailSettingsData>({
    provider: 'smtp',
    from: 'noreply@quayer.com',
    smtp: {
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
    },
  })

  // Fetch env defaults
  useEffect(() => {
    async function loadEnvDefaults() {
      try {
        const result = await getEnvDefaultsAction()
        if (result.success && result.data) {
          setEnvDefaults(result.data.email)
        }
      } catch (error) {
        console.error('Error loading env defaults:', error)
      }
    }
    loadEnvDefaults()
  }, [])

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings', 'email'],
    queryFn: async () => {
      const result = await (api['system-settings'].getByCategory as any).query({
        params: { category: 'email' },
        headers: getAuthHeaders(),
      })
      return result.data as EmailSettingsData
    },
  })

  // Fetch templates - using fetch directly to ensure cookies are sent
  const { data: templates, isLoading: loadingTemplates, error: templatesError } = useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      try {
        const token = getAuthToken()
        const response = await fetch('/api/v1/system-settings/email-templates', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        })

        if (!response.ok) {
          if (response.status === 401) throw new Error('Não autorizado')
          if (response.status === 403) throw new Error('Acesso negado: requer privilégios de administrador')
          throw new Error('Falha ao carregar templates')
        }

        const result = await response.json()
        console.log('[EmailSettings] Templates result:', result)

        // API returns { success: true, data: [...] }
        if (result?.error) {
          throw new Error(result.error)
        }
        return (result?.data || []) as EmailTemplate[]
      } catch (error: any) {
        console.error('[EmailSettings] Error fetching templates:', error)
        throw error
      }
    },
    retry: 1,
  })

  useEffect(() => {
    if (settings) {
      setFormData({
        provider: settings.provider || envDefaults?.provider as any || 'smtp',
        from: settings.from || envDefaults?.from || 'noreply@quayer.com',
        resendApiKey: settings.resendApiKey,
        smtp: settings.smtp || {
          host: envDefaults?.smtpHost || '',
          port: envDefaults?.smtpPort || 587,
          secure: false,
          user: envDefaults?.smtpUser || '',
          pass: '',
        },
      })
    } else if (envDefaults) {
      // If no database data, use env defaults
      setFormData({
        provider: envDefaults.provider as any || 'smtp',
        from: envDefaults.from || 'noreply@quayer.com',
        smtp: {
          host: envDefaults.smtpHost || '',
          port: envDefaults.smtpPort || 587,
          secure: false,
          user: envDefaults.smtpUser || '',
          pass: '',
        },
      })
    }
  }, [settings, envDefaults])

  // Load from env button handler
  const handleLoadFromEnv = () => {
    if (envDefaults) {
      setFormData({
        provider: envDefaults.provider as any || 'smtp',
        from: envDefaults.from || 'noreply@quayer.com',
        smtp: {
          host: envDefaults.smtpHost || '',
          port: envDefaults.smtpPort || 587,
          secure: false,
          user: envDefaults.smtpUser || '',
          pass: '',
        },
      })
      toast.success('Valores carregados do arquivo .env (senha precisa ser preenchida manualmente)')
    } else {
      toast.error('Nao foi possivel carregar valores do .env')
    }
  }

  // Save settings
  const saveMutation = useMutation({
    mutationFn: async (data: EmailSettingsData) => {
      return (api['system-settings'].updateEmail.mutate as any)({
        body: data,
        headers: getAuthHeaders(),
      })
    },
    onSuccess: () => {
      toast.success('Configurações de email salvas!')
      queryClient.invalidateQueries({ queryKey: ['system-settings', 'email'] })
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`)
    },
  })

  // Test SMTP
  const testSmtpMutation = useMutation({
    mutationFn: async () => {
      if (!formData.smtp) throw new Error('SMTP não configurado')
      if (!formData.smtp.host) throw new Error('Host SMTP é obrigatório')
      if (!formData.smtp.user) throw new Error('Usuário SMTP é obrigatório')
      if (!formData.smtp.pass) throw new Error('Senha SMTP é obrigatória')
      return (api['system-settings'].testSmtpConnection.mutate as any)({
        body: formData.smtp,
        headers: getAuthHeaders(),
      })
    },
    onSuccess: (result: any) => {
      if (result?.success) {
        toast.success('Conexão SMTP OK!')
      } else {
        toast.error(result?.error || 'Falha na conexão SMTP')
      }
    },
    onError: (error: any) => {
      toast.error(`Erro ao testar SMTP: ${error.message}`)
    },
  })

  // Save template
  const saveTemplateMutation = useMutation({
    mutationFn: async (template: Partial<EmailTemplate>) => {
      return (api['system-settings'].upsertEmailTemplate.mutate as any)({
        body: template as any,
        headers: getAuthHeaders(),
      })
    },
    onSuccess: () => {
      toast.success('Template salvo!')
      queryClient.invalidateQueries({ queryKey: ['email-templates'] })
      setIsTemplateDialogOpen(false)
      setEditingTemplate(null)
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`)
    },
  })

  const handleSave = () => {
    if (!formData.from) {
      toast.error('Email remetente é obrigatório')
      return
    }
    if (formData.provider === 'resend' && !formData.resendApiKey) {
      toast.error('API Key do Resend é obrigatória')
      return
    }
    if (formData.provider === 'smtp' && (!formData.smtp?.host || !formData.smtp?.user)) {
      toast.error('Configuração SMTP incompleta')
      return
    }
    saveMutation.mutate(formData)
  }

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template)
    setIsTemplateDialogOpen(true)
  }

  const handlePreviewTemplate = (template: EmailTemplate) => {
    setPreviewingTemplate(template)
    setIsPreviewDialogOpen(true)
  }

  // Replace template variables with sample data for preview
  const getPreviewHtml = (template: EmailTemplate) => {
    const sampleData: Record<string, string> = {
      name: 'João Silva',
      code: '123456',
      magicLink: 'https://quayer.com/login?token=abc123',
      expirationMinutes: '10',
      appUrl: 'https://quayer.com',
      inviterName: 'Maria Souza',
      organizationName: 'Empresa ACME',
      invitationUrl: 'https://quayer.com/convite/abc123',
      role: 'Operador',
      resetUrl: 'https://quayer.com/redefinir-senha?token=xyz789',
      email: 'joao.silva@empresa.com',
      loginUrl: 'https://quayer.com/login',
    }

    let html = template.htmlContent
    for (const [key, value] of Object.entries(sampleData)) {
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    }
    return html
  }

  // Refresh templates - re-fetch from API (will auto-initialize missing ones)
  const handleRefreshTemplates = () => {
    queryClient.invalidateQueries({ queryKey: ['email-templates'] })
    toast.success('Templates atualizados!')
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div role="status" aria-busy="true" aria-label="Carregando configurações de email">
            <Skeleton className="h-64 w-full" />
            <span className="sr-only">Carregando configurações de email...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Configurações */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" aria-hidden="true" />
                Configurações de Email
              </CardTitle>
              <CardDescription>
                Configure o provedor de email e credenciais para envio de emails da plataforma.
              </CardDescription>
            </div>
            {envDefaults && envDefaults.smtpHost && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadFromEnv}
                className="shrink-0"
              >
                <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                Carregar do .env
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Env info alert */}
          {envDefaults && envDefaults.smtpHost && (
            <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800" role="note">
              <Info className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <AlertTitle className="text-blue-700 dark:text-blue-400">Configuração detectada no .env</AlertTitle>
              <AlertDescription className="text-blue-600 dark:text-blue-300">
                <div className="mt-2 space-y-1 text-sm font-mono">
                  <div>Provedor: <span className="font-semibold">{envDefaults.provider || 'smtp'}</span></div>
                  <div>De: <span className="font-semibold">{envDefaults.from || 'N/A'}</span></div>
                  <div>SMTP Host: <span className="font-semibold">{envDefaults.smtpHost || 'N/A'}</span></div>
                  <div>SMTP User: <span className="font-semibold">{envDefaults.smtpUser || 'N/A'}</span></div>
                  <div>Senha: <span className="font-semibold">{envDefaults.smtpPasswordMasked || '****'}</span></div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label id="email-provider-label">Provedor</Label>
              <Select
                value={formData.provider}
                onValueChange={(value: any) => setFormData((prev) => ({ ...prev, provider: value }))}
              >
                <SelectTrigger aria-labelledby="email-provider-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mock">Mock (Desenvolvimento)</SelectItem>
                  <SelectItem value="resend">Resend</SelectItem>
                  <SelectItem value="smtp">SMTP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-from">Email Remetente</Label>
              <Input
                id="email-from"
                type="email"
                value={formData.from}
                onChange={(e) => setFormData((prev) => ({ ...prev, from: e.target.value }))}
                placeholder="noreply@quayer.com"
              />
            </div>
          </div>

          {formData.provider === 'resend' && (
            <div className="space-y-2">
              <Label htmlFor="resend-api-key">Resend API Key</Label>
              <div className="relative">
                <Input
                  id="resend-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.resendApiKey || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, resendApiKey: e.target.value }))}
                  placeholder="re_xxxxx"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowApiKey(!showApiKey)}
                  aria-label={showApiKey ? 'Ocultar API Key' : 'Mostrar API Key'}
                  aria-pressed={showApiKey}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </div>
            </div>
          )}

          {formData.provider === 'smtp' && (
            <fieldset className="space-y-4 p-4 border rounded-lg">
              <legend className="font-medium px-2">Configuração SMTP</legend>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">Host</Label>
                  <Input
                    id="smtp-host"
                    value={formData.smtp?.host || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        smtp: { ...prev.smtp!, host: e.target.value },
                      }))
                    }
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Porta</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    value={formData.smtp?.port || 587}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        smtp: { ...prev.smtp!, port: parseInt(e.target.value) },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-user">Usuário</Label>
                  <Input
                    id="smtp-user"
                    value={formData.smtp?.user || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        smtp: { ...prev.smtp!, user: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-pass">Senha</Label>
                  <div className="relative">
                    <Input
                      id="smtp-pass"
                      type={showSmtpPass ? 'text' : 'password'}
                      value={formData.smtp?.pass || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          smtp: { ...prev.smtp!, pass: e.target.value },
                        }))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      onClick={() => setShowSmtpPass(!showSmtpPass)}
                      aria-label={showSmtpPass ? 'Ocultar senha SMTP' : 'Mostrar senha SMTP'}
                      aria-pressed={showSmtpPass}
                    >
                      {showSmtpPass ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="smtp-secure"
                  checked={formData.smtp?.secure || false}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      smtp: { ...prev.smtp!, secure: checked },
                    }))
                  }
                  aria-describedby="smtp-secure-hint"
                />
                <Label htmlFor="smtp-secure" id="smtp-secure-hint">Usar TLS/SSL (porta 465)</Label>
              </div>
              <Button
                variant="outline"
                onClick={() => testSmtpMutation.mutate()}
                disabled={testSmtpMutation.isPending}
                aria-busy={testSmtpMutation.isPending}
              >
                {testSmtpMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {testSmtpMutation.isPending ? 'Testando...' : 'Testar Conexão SMTP'}
              </Button>
            </fieldset>
          )}

          <Separator />

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saveMutation.isPending} aria-busy={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              {saveMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" aria-hidden="true" />
                Templates de Email
              </CardTitle>
              <CardDescription>
                Personalize os emails enviados pela plataforma. Os templates são usados automaticamente em produção.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshTemplates}
            >
              <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
              Atualizar Templates
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingTemplates ? (
            <div role="status" aria-busy="true" aria-label="Carregando templates">
              <Skeleton className="h-32 w-full" />
              <span className="sr-only">Carregando templates de email...</span>
            </div>
          ) : templatesError ? (
            <Alert variant="destructive" role="alert">
              <XCircle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Erro ao carregar templates</AlertTitle>
              <AlertDescription>
                {(templatesError as any)?.message || 'Erro desconhecido. Verifique se você está logado como administrador.'}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleRefreshTemplates}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Tentar novamente
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Variáveis</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates?.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>{template.subject}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {template.variables.slice(0, 3).map((v) => (
                          <Badge key={v} variant="secondary" className="text-xs">
                            {`{{${v}}}`}
                          </Badge>
                        ))}
                        {template.variables.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{template.variables.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={template.isActive ? 'default' : 'secondary'}>
                        {template.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePreviewTemplate(template)}
                          title="Visualizar"
                        >
                          <Monitor className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditTemplate(template)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!templates || templates.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum template encontrado. Os templates padrão serão criados automaticamente.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Template Edit Dialog */}
      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Template: {editingTemplate?.name}</DialogTitle>
            <DialogDescription>
              Personalize o conteúdo do email. Use variáveis como {`{{name}}`} para dados dinâmicos.
            </DialogDescription>
          </DialogHeader>

          {editingTemplate && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Assunto</Label>
                <Input
                  value={editingTemplate.subject}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, subject: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Conteúdo HTML</Label>
                <TiptapEditor
                  content={editingTemplate.htmlContent}
                  onChange={(html) =>
                    setEditingTemplate({ ...editingTemplate, htmlContent: html })
                  }
                  variables={editingTemplate.variables}
                  placeholder="Comece a escrever o conteúdo do email..."
                />
              </div>

              <div className="space-y-2">
                <Label>Conteúdo Texto (fallback)</Label>
                <Textarea
                  className="font-mono text-sm"
                  value={editingTemplate.textContent || ''}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, textContent: e.target.value })
                  }
                  placeholder="Versão texto puro do email"
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={editingTemplate.isActive}
                  onCheckedChange={(checked) =>
                    setEditingTemplate({ ...editingTemplate, isActive: checked })
                  }
                />
                <Label>Template ativo</Label>
              </div>

              <Alert>
                <Code2 className="h-4 w-4" />
                <AlertTitle>Variáveis disponíveis</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {editingTemplate.variables.map((v) => (
                      <Badge key={v} variant="outline">
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => editingTemplate && saveTemplateMutation.mutate(editingTemplate)}
              disabled={saveTemplateMutation.isPending}
            >
              {saveTemplateMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Visualização: {previewingTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              Preview do email com dados de exemplo. As variáveis foram substituídas por valores fictícios.
            </DialogDescription>
          </DialogHeader>

          {previewingTemplate && (
            <div className="flex-1 overflow-hidden rounded-lg border bg-white">
              <div className="bg-muted/50 p-3 border-b">
                <div className="text-sm">
                  <span className="font-medium">Assunto: </span>
                  <span className="text-muted-foreground">
                    {previewingTemplate.subject
                      .replace(/\{\{name\}\}/g, 'João Silva')
                      .replace(/\{\{code\}\}/g, '123456')
                      .replace(/\{\{organizationName\}\}/g, 'Empresa ACME')}
                  </span>
                </div>
              </div>
              <iframe
                title="Email Preview"
                className="w-full h-[500px] border-0"
                srcDoc={getPreviewHtml(previewingTemplate)}
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsPreviewDialogOpen(false)}>
              Fechar
            </Button>
            <Button
              onClick={() => {
                setIsPreviewDialogOpen(false)
                if (previewingTemplate) {
                  handleEditTemplate(previewingTemplate)
                }
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Editar Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
