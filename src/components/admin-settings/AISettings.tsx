'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bot, Eye, EyeOff, Save, RefreshCw, CheckCircle2, Info,
  Pencil, Sparkles, Image, AudioLines, FileText, MessageSquare, Video, FileCode, FileUp
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { api, getAuthHeaders } from '@/igniter.client'
import { getEnvDefaultsAction } from '@/app/admin/actions'

interface EnvDefaults {
  openaiApiKey: string
  openaiApiKeyMasked: string
  defaultModel: string
}

interface AISettingsData {
  openaiApiKey: string
  defaultModel: string
  imageDescriptionEnabled: boolean
  audioTranscriptionEnabled: boolean
  documentAnalysisEnabled: boolean
  videoTranscriptionEnabled: boolean
}

interface AIPrompt {
  id: string
  name: string
  description?: string
  prompt: string
  model?: string
  isActive: boolean
  usageCount: number
}

const PROMPT_ICONS: Record<string, any> = {
  image_description: Image,
  audio_transcription: AudioLines,
  document_analysis: FileText,
  video_transcription: Video,
  message_summary: MessageSquare,
}

const MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o (Mais capaz)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Custo-benefício)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'whisper-1', label: 'Whisper (Transcrição)' },
]

// Variables that can be used in prompts
const PROMPT_VARIABLES: Record<string, { variables: string[]; description: string }> = {
  image_description: {
    variables: ['image_content', 'sender_name', 'context'],
    description: 'Descricao automatica de imagens recebidas',
  },
  audio_transcription: {
    variables: ['audio_duration', 'sender_name', 'language'],
    description: 'Transcricao de mensagens de audio usando Whisper',
  },
  document_analysis: {
    variables: ['document_type', 'document_content', 'sender_name'],
    description: 'Analise de documentos PDF e Word',
  },
  video_transcription: {
    variables: ['video_duration', 'sender_name', 'language'],
    description: 'Transcricao de videos com extracao de audio',
  },
  message_summary: {
    variables: ['messages', 'sender_name', 'time_range'],
    description: 'Resumo de conversas e mensagens',
  },
}

export function AISettings() {
  const queryClient = useQueryClient()
  const [showApiKey, setShowApiKey] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<AIPrompt | null>(null)
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false)
  const [envDefaults, setEnvDefaults] = useState<EnvDefaults | null>(null)

  const [formData, setFormData] = useState<AISettingsData>({
    openaiApiKey: '',
    defaultModel: 'gpt-4o-mini',
    imageDescriptionEnabled: true,
    audioTranscriptionEnabled: true,
    documentAnalysisEnabled: true,
    videoTranscriptionEnabled: false,
  })

  // Fetch env defaults
  useEffect(() => {
    async function loadEnvDefaults() {
      try {
        const result = await getEnvDefaultsAction()
        if (result.success && result.data) {
          setEnvDefaults(result.data.ai)
        }
      } catch (error) {
        console.error('Error loading env defaults:', error)
      }
    }
    loadEnvDefaults()
  }, [])

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings', 'ai'],
    queryFn: async () => {
      const result = await (api['system-settings'].getByCategory as any).query({
        params: { category: 'ai' },
        headers: getAuthHeaders(),
      })
      return result.data as AISettingsData
    },
  })

  // Fetch prompts
  const { data: prompts, isLoading: loadingPrompts } = useQuery({
    queryKey: ['ai-prompts'],
    queryFn: async () => {
      const result = await api['system-settings'].getAIPrompts.query({
        headers: getAuthHeaders(),
      })
      // API returns { data: { success: true, data: [...] } }
      const responseData = (result as any)?.data
      return (responseData?.data || []) as AIPrompt[]
    },
  })

  useEffect(() => {
    if (settings) {
      setFormData({
        openaiApiKey: settings.openaiApiKey || envDefaults?.openaiApiKey || '',
        defaultModel: settings.defaultModel || envDefaults?.defaultModel || 'gpt-4o-mini',
        imageDescriptionEnabled: settings.imageDescriptionEnabled ?? true,
        audioTranscriptionEnabled: settings.audioTranscriptionEnabled ?? true,
        documentAnalysisEnabled: settings.documentAnalysisEnabled ?? true,
        videoTranscriptionEnabled: settings.videoTranscriptionEnabled ?? false,
      })
    } else if (envDefaults) {
      // Se não há dados do banco, usar env defaults
      setFormData((prev) => ({
        ...prev,
        openaiApiKey: envDefaults.openaiApiKey || '',
        defaultModel: envDefaults.defaultModel || 'gpt-4o-mini',
      }))
    }
  }, [settings, envDefaults])

  // Load from env button handler
  const handleLoadFromEnv = () => {
    if (envDefaults) {
      setFormData((prev) => ({
        ...prev,
        openaiApiKey: envDefaults.openaiApiKey,
        defaultModel: envDefaults.defaultModel || 'gpt-4o-mini',
      }))
      toast.success('Valores carregados do arquivo .env')
    } else {
      toast.error('Não foi possível carregar valores do .env')
    }
  }

  const hasEnvData = envDefaults && envDefaults.openaiApiKey

  // Save settings
  const saveMutation = useMutation({
    mutationFn: async (data: AISettingsData) => {
      return api['system-settings'].updateAI.mutate({
        body: data,
        headers: getAuthHeaders(),
      })
    },
    onSuccess: () => {
      toast.success('Configurações de IA salvas!')
      queryClient.invalidateQueries({ queryKey: ['system-settings', 'ai'] })
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`)
    },
  })

  // Test OpenAI
  const testMutation = useMutation({
    mutationFn: async () => {
      return api['system-settings'].testOpenAIConnection.mutate({
        body: { apiKey: formData.openaiApiKey },
        headers: getAuthHeaders(),
      })
    },
    onSuccess: (result: any) => {
      if (result.success) {
        toast.success('Conexão OpenAI OK!')
      } else {
        toast.error(result.error || 'Falha OpenAI')
      }
    },
  })

  // Save prompt
  const savePromptMutation = useMutation({
    mutationFn: async (prompt: Partial<AIPrompt>) => {
      return api['system-settings'].upsertAIPrompt.mutate({
        body: prompt as any,
        headers: getAuthHeaders(),
      })
    },
    onSuccess: () => {
      toast.success('Prompt salvo!')
      queryClient.invalidateQueries({ queryKey: ['ai-prompts'] })
      setIsPromptDialogOpen(false)
      setEditingPrompt(null)
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`)
    },
  })

  const handleSave = () => {
    saveMutation.mutate(formData)
  }

  const handleEditPrompt = (prompt: AIPrompt) => {
    setEditingPrompt(prompt)
    setIsPromptDialogOpen(true)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div role="status" aria-busy="true" aria-label="Carregando configurações de IA">
            <Skeleton className="h-64 w-full" />
            <span className="sr-only">Carregando configurações de IA...</span>
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
                <Bot className="h-5 w-5" aria-hidden="true" />
                Configurações de IA
              </CardTitle>
              <CardDescription>
                Configure a integração com OpenAI para transcrição de áudio, descrição de imagens e análise de documentos.
              </CardDescription>
            </div>
            {hasEnvData && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadFromEnv}
                className="shrink-0"
              >
                <FileUp className="h-4 w-4 mr-2" aria-hidden="true" />
                Carregar do .env
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Env info alert */}
          {hasEnvData && (
            <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800" role="note">
              <Info className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <AlertTitle className="text-blue-700 dark:text-blue-400">Configuração detectada no .env</AlertTitle>
              <AlertDescription className="text-blue-600 dark:text-blue-300">
                <div className="mt-2 space-y-1 text-sm font-mono">
                  <div>API Key: <span className="font-semibold">{envDefaults?.openaiApiKeyMasked || 'N/A'}</span></div>
                  <div>Modelo: <span className="font-semibold">{envDefaults?.defaultModel || 'gpt-4o-mini'}</span></div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="openai-api-key">OpenAI API Key</Label>
              <div className="relative">
                <Input
                  id="openai-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.openaiApiKey}
                  onChange={(e) => setFormData((prev) => ({ ...prev, openaiApiKey: e.target.value }))}
                  placeholder="sk-xxxxx"
                  aria-describedby="openai-key-help"
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
              <p id="openai-key-help" className="text-xs text-muted-foreground">
                Obtenha em: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">platform.openai.com</a>
              </p>
            </div>

            <div className="space-y-2">
              <Label id="default-model-label">Modelo Padrão</Label>
              <Select
                value={formData.defaultModel}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, defaultModel: value }))}
              >
                <SelectTrigger aria-labelledby="default-model-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="font-medium">Funcionalidades</h4>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Image className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="font-medium" id="image-desc-label">Descrição de Imagens</p>
                    <p className="text-sm text-muted-foreground" id="image-desc-hint">
                      Descreve automaticamente imagens recebidas via WhatsApp
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.imageDescriptionEnabled}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, imageDescriptionEnabled: checked }))
                  }
                  aria-labelledby="image-desc-label"
                  aria-describedby="image-desc-hint"
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <AudioLines className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="font-medium" id="audio-trans-label">Transcrição de Áudio</p>
                    <p className="text-sm text-muted-foreground" id="audio-trans-hint">
                      Transcreve áudios usando Whisper (OpenAI)
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.audioTranscriptionEnabled}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, audioTranscriptionEnabled: checked }))
                  }
                  aria-labelledby="audio-trans-label"
                  aria-describedby="audio-trans-hint"
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="font-medium" id="doc-analysis-label">Análise de Documentos</p>
                    <p className="text-sm text-muted-foreground" id="doc-analysis-hint">
                      Analisa PDF e documentos do Word recebidos via WhatsApp
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.documentAnalysisEnabled}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, documentAnalysisEnabled: checked }))
                  }
                  aria-labelledby="doc-analysis-label"
                  aria-describedby="doc-analysis-hint"
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Video className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="font-medium" id="video-trans-label">Transcrição de Vídeo</p>
                    <p className="text-sm text-muted-foreground" id="video-trans-hint">
                      Extrai áudio de vídeos e transcreve automaticamente
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.videoTranscriptionEnabled}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, videoTranscriptionEnabled: checked }))
                  }
                  aria-labelledby="video-trans-label"
                  aria-describedby="video-trans-hint"
                />
              </div>

              <Alert className="mt-4" role="note">
                <Info className="h-4 w-4" aria-hidden="true" />
                <AlertDescription className="text-sm">
                  <strong>Formatos suportados:</strong>
                  <ul className="mt-2 list-disc list-inside space-y-1 text-muted-foreground">
                    <li><strong>Imagem:</strong> JPG, PNG, GIF, WebP</li>
                    <li><strong>Audio:</strong> MP3, OGG, WAV, M4A, AAC</li>
                    <li><strong>Documento:</strong> PDF, DOC, DOCX, TXT</li>
                    <li><strong>Video:</strong> MP4, MOV, AVI, WebM</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !formData.openaiApiKey}
              aria-busy={testMutation.isPending}
            >
              {testMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              {testMutation.isPending ? 'Testando...' : 'Testar Conexão'}
            </Button>
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

      {/* Prompts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            Prompts de IA
          </CardTitle>
          <CardDescription>
            Personalize os prompts usados para transcrição, descrição e análise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPrompts ? (
            <div role="status" aria-busy="true" aria-label="Carregando prompts">
              <Skeleton className="h-32 w-full" />
              <span className="sr-only">Carregando prompts...</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prompt</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Uso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prompts?.map((prompt) => {
                  const Icon = PROMPT_ICONS[prompt.name] || Sparkles
                  return (
                    <TableRow key={prompt.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{prompt.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {prompt.description || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{prompt.model || 'Padrão'}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">{prompt.usageCount}x</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={prompt.isActive ? 'default' : 'secondary'}>
                          {prompt.isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditPrompt(prompt)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {(!prompts || prompts.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum prompt encontrado. Os prompts padrão serão criados automaticamente.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Prompt Edit Dialog */}
      <Dialog open={isPromptDialogOpen} onOpenChange={setIsPromptDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingPrompt && (() => {
                const Icon = PROMPT_ICONS[editingPrompt.name] || Sparkles
                return <Icon className="h-5 w-5" />
              })()}
              Editar Prompt: {editingPrompt?.name?.replace(/_/g, ' ')}
            </DialogTitle>
            <DialogDescription>
              {editingPrompt && PROMPT_VARIABLES[editingPrompt.name]?.description}
            </DialogDescription>
          </DialogHeader>

          {editingPrompt && (
            <Tabs defaultValue="editor" className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="editor">Editor</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="help">Ajuda</TabsTrigger>
              </TabsList>

              <TabsContent value="editor" className="flex-1 space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Descricao</Label>
                    <Input
                      value={editingPrompt.description || ''}
                      onChange={(e) =>
                        setEditingPrompt({ ...editingPrompt, description: e.target.value })
                      }
                      placeholder="Descricao do uso deste prompt"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label id="prompt-model-label">Modelo</Label>
                    <Select
                      value={editingPrompt.model || '_default'}
                      onValueChange={(value) =>
                        setEditingPrompt({ ...editingPrompt, model: value === '_default' ? '' : value })
                      }
                    >
                      <SelectTrigger aria-labelledby="prompt-model-label">
                        <SelectValue placeholder="Usar modelo padrão" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_default">Usar modelo padrão</SelectItem>
                        {MODELS.map((model) => (
                          <SelectItem key={model.value} value={model.value}>
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Variable Buttons */}
                {PROMPT_VARIABLES[editingPrompt.name]?.variables && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Inserir variavel:</Label>
                    <div className="flex flex-wrap gap-2">
                      {PROMPT_VARIABLES[editingPrompt.name].variables.map((variable) => (
                        <Button
                          key={variable}
                          variant="outline"
                          size="sm"
                          className="font-mono text-xs h-7"
                          onClick={() => {
                            const insertion = `{{${variable}}}`
                            setEditingPrompt({
                              ...editingPrompt,
                              prompt: editingPrompt.prompt + insertion,
                            })
                          }}
                        >
                          {`{{${variable}}}`}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2 flex-1">
                  <Label>Prompt</Label>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {editingPrompt.prompt.length} caracteres
                      </span>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={editingPrompt.isActive}
                          onCheckedChange={(checked) =>
                            setEditingPrompt({ ...editingPrompt, isActive: checked })
                          }
                        />
                        <Label className="text-xs">Ativo</Label>
                      </div>
                    </div>
                    <Textarea
                      className="font-mono text-sm min-h-[300px] border-0 rounded-none resize-y focus-visible:ring-0 focus-visible:ring-offset-0"
                      value={editingPrompt.prompt}
                      onChange={(e) =>
                        setEditingPrompt({ ...editingPrompt, prompt: e.target.value })
                      }
                      placeholder="Digite o prompt aqui..."
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="flex-1 mt-4">
                <ScrollArea className="h-[400px] border rounded-lg">
                  <div className="p-4 space-y-4">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Prompt que sera enviado:</h4>
                      <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap">
                        {editingPrompt.prompt || 'Nenhum prompt definido'}
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Exemplo de uso:</h4>
                      <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg text-sm">
                        <p className="text-muted-foreground mb-2">
                          O prompt acima sera combinado com o conteudo recebido:
                        </p>
                        <pre className="bg-background/50 p-3 rounded text-xs overflow-x-auto">
{`{
  "model": "${editingPrompt.model || formData.defaultModel}",
  "messages": [
    {
      "role": "system",
      "content": "${editingPrompt.prompt.slice(0, 100)}..."
    },
    {
      "role": "user",
      "content": "[Conteudo da midia]"
    }
  ]
}`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="help" className="flex-1 mt-4">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4 p-1">
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Dicas para bons prompts</AlertTitle>
                      <AlertDescription className="space-y-2 mt-2">
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>Seja especifico sobre o formato de resposta desejado</li>
                          <li>Defina o idioma da resposta (portugues brasileiro)</li>
                          <li>Inclua contexto relevante sobre o uso do sistema</li>
                          <li>Use instrucoes claras e diretas</li>
                          <li>Teste com diferentes tipos de conteudo</li>
                        </ul>
                      </AlertDescription>
                    </Alert>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Variaveis disponiveis</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {PROMPT_VARIABLES[editingPrompt.name]?.variables.map((variable) => (
                          <div key={variable} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                            <code className="text-xs font-mono">{`{{${variable}}}`}</code>
                            <span className="text-xs text-muted-foreground">
                              {variable === 'image_content' && 'Conteudo da imagem'}
                              {variable === 'audio_duration' && 'Duracao do audio'}
                              {variable === 'video_duration' && 'Duracao do video'}
                              {variable === 'document_type' && 'Tipo do documento'}
                              {variable === 'document_content' && 'Conteudo do documento'}
                              {variable === 'sender_name' && 'Nome do remetente'}
                              {variable === 'language' && 'Idioma detectado'}
                              {variable === 'context' && 'Contexto da conversa'}
                              {variable === 'messages' && 'Mensagens da conversa'}
                              {variable === 'time_range' && 'Periodo de tempo'}
                            </span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Exemplo de prompt</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-xs bg-muted/50 p-3 rounded whitespace-pre-wrap">
{`Voce e um assistente de atendimento ao cliente da Quayer.

Analise o conteudo recebido e forneca uma descricao clara e objetiva em portugues brasileiro.

Diretrizes:
- Seja conciso e direto
- Identifique informacoes relevantes
- Mencione qualquer texto visivel
- Responda em formato de paragrafo

Contexto: {{context}}
Remetente: {{sender_name}}`}
                        </pre>
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsPromptDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => editingPrompt && savePromptMutation.mutate(editingPrompt)}
              disabled={savePromptMutation.isPending}
            >
              {savePromptMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
