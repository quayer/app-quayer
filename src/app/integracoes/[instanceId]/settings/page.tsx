'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  ArrowLeft,
  Save,
  RotateCcw,
  MessageSquare,
  Bot,
  MapPin,
  Clock,
  Terminal,
  Loader2,
  Info,
  Webhook,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

// Helper para fazer requests autenticados
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `Erro HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData?.message) {
        errorMessage = errorData.message;
      } else if (errorData?.error) {
        errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.error?.message || JSON.stringify(errorData.error);
      }
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(errorMessage);
  }

  const text = await response.text();
  if (!text) {
    return { success: true };
  }

  try {
    return JSON.parse(text);
  } catch {
    return { success: true, data: text };
  }
}

interface ConnectionSettings {
  // Concatenacao
  concatEnabled: boolean;
  concatTimeoutMs: number;
  concatMaxMessages: number;
  concatSameType: boolean;
  concatSameSender: boolean;
  // Transcricao & IA
  transcriptionEnabled: boolean;
  imageDescriptionEnabled: boolean;
  documentAnalysisEnabled: boolean;
  videoTranscriptionEnabled: boolean;
  // Geocoding
  geocodingEnabled: boolean;
  geocodingApiKey: string | null;
  // AI Models
  transcriptionModel: string | null;
  visionModel: string | null;
  analysisModel: string | null;
  // WhatsApp 24h Window
  enforceWhatsAppWindow: boolean;
  templateFallbackEnabled: boolean;
  // Bot Echo Detection
  botEchoEnabled: boolean;
  botSignature: string | null;
  // Auto-Pause
  autoPauseOnHumanReply: boolean;
  autoPauseDurationHours: number;
  // Comandos
  commandsEnabled: boolean;
  commandPrefix: string;
}

interface ConnectionInfo {
  id: string;
  name: string;
  provider: string;
  status: string;
  n8nWebhookUrl: string | null;
  n8nWorkflowId: string | null;
  n8nFallbackUrl: string | null;
  agentConfig: any;
  webhooks: Array<{
    id: string;
    url: string;
    events: string[];
    isActive: boolean;
    lastDeliveryAt: string | null;
    lastStatus: string | null;
  }>;
}

const DEFAULT_SETTINGS: ConnectionSettings = {
  concatEnabled: true,
  concatTimeoutMs: 8000,
  concatMaxMessages: 10,
  concatSameType: false,
  concatSameSender: true,
  transcriptionEnabled: true,
  imageDescriptionEnabled: true,
  documentAnalysisEnabled: true,
  videoTranscriptionEnabled: true,
  geocodingEnabled: true,
  geocodingApiKey: null,
  transcriptionModel: 'whisper-1',
  visionModel: 'gpt-4o',
  analysisModel: 'gpt-4o',
  enforceWhatsAppWindow: true,
  templateFallbackEnabled: false,
  botEchoEnabled: true,
  botSignature: null,
  autoPauseOnHumanReply: true,
  autoPauseDurationHours: 24,
  commandsEnabled: true,
  commandPrefix: '@',
};

export default function InstanceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const instanceId = params.instanceId as string;

  const [settings, setSettings] = useState<ConnectionSettings>(DEFAULT_SETTINGS);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Carregar configuracoes
  useEffect(() => {
    async function loadSettings() {
      try {
        // Carregar settings e info da conexao em paralelo
        const [settingsResponse, connectionResponse] = await Promise.all([
          fetchWithAuth(`/api/v1/connection-settings/${instanceId}`),
          fetchWithAuth(`/api/v1/instances/${instanceId}`).catch(() => null),
        ]);

        if (settingsResponse.data) {
          setSettings(settingsResponse.data.settings);
          setIsDefault(settingsResponse.data.isDefault);
        }

        if (connectionResponse?.data) {
          const conn = connectionResponse.data;
          setConnectionInfo({
            id: conn.id,
            name: conn.name,
            provider: conn.provider,
            status: conn.status,
            n8nWebhookUrl: conn.n8nWebhookUrl,
            n8nWorkflowId: conn.n8nWorkflowId,
            n8nFallbackUrl: conn.n8nFallbackUrl,
            agentConfig: conn.agentConfig,
            webhooks: conn.webhooks || [],
          });
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
        toast.error('Erro ao carregar configuracoes');
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [instanceId]);

  // Atualizar settings
  const updateSetting = <K extends keyof ConnectionSettings>(
    key: K,
    value: ConnectionSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  // Salvar configuracoes
  const handleSave = async () => {
    setSaving(true);
    try {
      await fetchWithAuth(`/api/v1/connection-settings/${instanceId}`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      toast.success('Configuracoes salvas com sucesso');
      setHasChanges(false);
      setIsDefault(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Erro ao salvar configuracoes');
    } finally {
      setSaving(false);
    }
  };

  // Resetar para defaults
  const handleReset = async () => {
    setSaving(true);
    try {
      await fetchWithAuth(`/api/v1/connection-settings/${instanceId}/reset`, {
        method: 'POST',
      });
      setSettings(DEFAULT_SETTINGS);
      setIsDefault(true);
      setHasChanges(false);
      toast.success('Configuracoes restauradas para o padrao');
    } catch (error) {
      console.error('Failed to reset settings:', error);
      toast.error('Erro ao restaurar configuracoes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container max-w-4xl py-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Configuracoes Avancadas</h1>
            <p className="text-muted-foreground">
              Personalize o comportamento desta integracao
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDefault && (
            <Badge variant="secondary">Usando padrao</Badge>
          )}
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={saving || isDefault}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar Padrao
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      {hasChanges && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Voce tem alteracoes nao salvas. Clique em &quot;Salvar&quot; para aplicar.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="concatenation" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="concatenation" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Concatenacao</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">IA</span>
          </TabsTrigger>
          <TabsTrigger value="geocoding" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span className="hidden sm:inline">Geocoding</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">WhatsApp</span>
          </TabsTrigger>
          <TabsTrigger value="commands" className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            <span className="hidden sm:inline">Comandos</span>
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            <span className="hidden sm:inline">Webhooks</span>
          </TabsTrigger>
        </TabsList>

        {/* Concatenacao Tab */}
        <TabsContent value="concatenation">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Concatenacao de Mensagens
              </CardTitle>
              <CardDescription>
                Configure como mensagens rapidas do mesmo contato sao agrupadas antes de serem processadas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enable/Disable */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Ativar Concatenacao</Label>
                  <p className="text-sm text-muted-foreground">
                    Agrupa mensagens rapidas em uma unica mensagem
                  </p>
                </div>
                <Switch
                  checked={settings.concatEnabled}
                  onCheckedChange={(v) => updateSetting('concatEnabled', v)}
                />
              </div>

              <Separator />

              {/* Timeout */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Timeout de Espera</Label>
                  <Badge variant="outline">{settings.concatTimeoutMs / 1000}s</Badge>
                </div>
                <Slider
                  value={[settings.concatTimeoutMs]}
                  onValueChange={([v]) => updateSetting('concatTimeoutMs', v)}
                  min={3000}
                  max={15000}
                  step={1000}
                  disabled={!settings.concatEnabled}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>3s (rapido)</span>
                  <span>15s (mais agrupamento)</span>
                </div>
              </div>

              <Separator />

              {/* Max Messages */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Maximo de Mensagens por Bloco</Label>
                  <Badge variant="outline">{settings.concatMaxMessages}</Badge>
                </div>
                <Slider
                  value={[settings.concatMaxMessages]}
                  onValueChange={([v]) => updateSetting('concatMaxMessages', v)}
                  min={3}
                  max={30}
                  step={1}
                  disabled={!settings.concatEnabled}
                />
              </div>

              <Separator />

              {/* Behavior Options */}
              <div className="space-y-4">
                <Label>Comportamento</Label>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Concatenar apenas mesmo tipo</p>
                    <p className="text-xs text-muted-foreground">
                      Texto com texto, midia com midia
                    </p>
                  </div>
                  <Switch
                    checked={settings.concatSameType}
                    onCheckedChange={(v) => updateSetting('concatSameType', v)}
                    disabled={!settings.concatEnabled}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Apenas mesmo remetente</p>
                    <p className="text-xs text-muted-foreground">
                      Recomendado sempre ativo
                    </p>
                  </div>
                  <Switch
                    checked={settings.concatSameSender}
                    onCheckedChange={(v) => updateSetting('concatSameSender', v)}
                    disabled={!settings.concatEnabled}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Tab */}
        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Transcricao e IA
              </CardTitle>
              <CardDescription>
                Configure quais tipos de midia devem ser processados por IA.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Feature Toggles */}
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Transcricao de Audio</Label>
                    <p className="text-sm text-muted-foreground">
                      Transcreve audios usando Whisper
                    </p>
                  </div>
                  <Switch
                    checked={settings.transcriptionEnabled}
                    onCheckedChange={(v) => updateSetting('transcriptionEnabled', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Descricao de Imagens</Label>
                    <p className="text-sm text-muted-foreground">
                      Descreve imagens automaticamente
                    </p>
                  </div>
                  <Switch
                    checked={settings.imageDescriptionEnabled}
                    onCheckedChange={(v) => updateSetting('imageDescriptionEnabled', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Analise de Documentos</Label>
                    <p className="text-sm text-muted-foreground">
                      Analisa PDF e documentos Word
                    </p>
                  </div>
                  <Switch
                    checked={settings.documentAnalysisEnabled}
                    onCheckedChange={(v) => updateSetting('documentAnalysisEnabled', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Transcricao de Video</Label>
                    <p className="text-sm text-muted-foreground">
                      Extrai e transcreve audio de videos
                    </p>
                  </div>
                  <Switch
                    checked={settings.videoTranscriptionEnabled}
                    onCheckedChange={(v) => updateSetting('videoTranscriptionEnabled', v)}
                  />
                </div>
              </div>

              <Separator />

              {/* Model Selection */}
              <div className="space-y-4">
                <Label>Modelos de IA</Label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Transcricao</Label>
                    <Select
                      value={settings.transcriptionModel || 'whisper-1'}
                      onValueChange={(v) => updateSetting('transcriptionModel', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whisper-1">whisper-1</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Visao</Label>
                    <Select
                      value={settings.visionModel || 'gpt-4o'}
                      onValueChange={(v) => updateSetting('visionModel', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                        <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                        <SelectItem value="claude-3-opus">claude-3-opus</SelectItem>
                        <SelectItem value="claude-3-sonnet">claude-3-sonnet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Geocoding Tab */}
        <TabsContent value="geocoding">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Geocoding (Localizacao)
              </CardTitle>
              <CardDescription>
                Resolve automaticamente enderecos quando cliente envia localizacao.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Resolver Endereco Automaticamente</Label>
                  <p className="text-sm text-muted-foreground">
                    Converte latitude/longitude em endereco completo
                  </p>
                </div>
                <Switch
                  checked={settings.geocodingEnabled}
                  onCheckedChange={(v) => updateSetting('geocodingEnabled', v)}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>API Key do Google Maps (opcional)</Label>
                <Input
                  type="password"
                  placeholder="Usar chave do sistema"
                  value={settings.geocodingApiKey || ''}
                  onChange={(e) => updateSetting('geocodingApiKey', e.target.value || null)}
                  disabled={!settings.geocodingEnabled}
                />
                <p className="text-xs text-muted-foreground">
                  Se vazio, usa a chave configurada no sistema
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WhatsApp Tab */}
        <TabsContent value="whatsapp">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                WhatsApp 24h e Auto-Pause
              </CardTitle>
              <CardDescription>
                Configuracoes de compliance e bloqueio automatico de IA.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* WhatsApp Window */}
              <div className="space-y-4">
                <Label className="text-base font-medium">Janela 24h do WhatsApp</Label>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Enforcar Janela 24h</p>
                    <p className="text-xs text-muted-foreground">
                      Bloqueia envio apos 24h sem resposta do cliente
                    </p>
                  </div>
                  <Switch
                    checked={settings.enforceWhatsAppWindow}
                    onCheckedChange={(v) => updateSetting('enforceWhatsAppWindow', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Fallback para Templates</p>
                    <p className="text-xs text-muted-foreground">
                      Usa template quando janela expira
                    </p>
                  </div>
                  <Switch
                    checked={settings.templateFallbackEnabled}
                    onCheckedChange={(v) => updateSetting('templateFallbackEnabled', v)}
                  />
                </div>
              </div>

              <Separator />

              {/* Bot Echo Detection */}
              <div className="space-y-4">
                <Label className="text-base font-medium">Deteccao de Echo</Label>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Prevenir Loop Infinito</p>
                    <p className="text-xs text-muted-foreground">
                      Detecta e ignora mensagens enviadas pelo bot
                    </p>
                  </div>
                  <Switch
                    checked={settings.botEchoEnabled}
                    onCheckedChange={(v) => updateSetting('botEchoEnabled', v)}
                  />
                </div>
              </div>

              <Separator />

              {/* Auto-Pause */}
              <div className="space-y-4">
                <Label className="text-base font-medium">Auto-Pause</Label>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Pausar IA quando humano responder</p>
                    <p className="text-xs text-muted-foreground">
                      Bloqueia IA automaticamente quando agente envia mensagem
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoPauseOnHumanReply}
                    onCheckedChange={(v) => updateSetting('autoPauseOnHumanReply', v)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Duracao do Pause</Label>
                    <Badge variant="outline">{settings.autoPauseDurationHours}h</Badge>
                  </div>
                  <Slider
                    value={[settings.autoPauseDurationHours]}
                    onValueChange={([v]) => updateSetting('autoPauseDurationHours', v)}
                    min={1}
                    max={168}
                    step={1}
                    disabled={!settings.autoPauseOnHumanReply}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1h</span>
                    <span>7 dias (168h)</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Commands Tab */}
        <TabsContent value="commands">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Comandos via Chat
              </CardTitle>
              <CardDescription>
                Configure comandos que podem ser enviados via chat para controlar sessoes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Habilitar Comandos</Label>
                  <p className="text-sm text-muted-foreground">
                    Permite controlar sessoes via comandos no chat
                  </p>
                </div>
                <Switch
                  checked={settings.commandsEnabled}
                  onCheckedChange={(v) => updateSetting('commandsEnabled', v)}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Prefixo de Comandos</Label>
                <Input
                  value={settings.commandPrefix}
                  onChange={(e) => updateSetting('commandPrefix', e.target.value.slice(0, 5))}
                  maxLength={5}
                  disabled={!settings.commandsEnabled}
                  className="w-20"
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <Label>Comandos Disponiveis</Label>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                    <code className="font-mono text-primary">
                      {settings.commandPrefix}fechar
                    </code>
                    <span className="text-muted-foreground">Fecha a sessao</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                    <code className="font-mono text-primary">
                      {settings.commandPrefix}pausar [h]
                    </code>
                    <span className="text-muted-foreground">Pausa IA por X horas</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                    <code className="font-mono text-primary">
                      {settings.commandPrefix}reabrir
                    </code>
                    <span className="text-muted-foreground">Reativa a IA</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                    <code className="font-mono text-primary">
                      {settings.commandPrefix}blacklist
                    </code>
                    <span className="text-muted-foreground">Bypass permanente do bot</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                    <code className="font-mono text-primary">
                      {settings.commandPrefix}whitelist
                    </code>
                    <span className="text-muted-foreground">Remove bypass</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                    <code className="font-mono text-primary">
                      {settings.commandPrefix}transferir [id]
                    </code>
                    <span className="text-muted-foreground">Transfere sessao</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                    <code className="font-mono text-primary">
                      {settings.commandPrefix}status
                    </code>
                    <span className="text-muted-foreground">Mostra status</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5" />
                Webhooks e Integracoes
              </CardTitle>
              <CardDescription>
                Visualize e gerencie webhooks conectados a esta integracao.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* n8n Integration */}
              <div className="space-y-4">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Integracao n8n (Agente IA)
                </Label>
                {connectionInfo?.n8nWebhookUrl ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">
                        Webhook n8n Conectado
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground mb-1">URL do Webhook</p>
                          <p className="text-sm font-mono truncate">{connectionInfo.n8nWebhookUrl}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            navigator.clipboard.writeText(connectionInfo.n8nWebhookUrl || '');
                            toast.success('URL copiada!');
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      {connectionInfo.n8nWorkflowId && (
                        <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Workflow ID</p>
                            <p className="text-sm font-mono">{connectionInfo.n8nWorkflowId}</p>
                          </div>
                        </div>
                      )}
                      {connectionInfo.n8nFallbackUrl && (
                        <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground mb-1">URL de Fallback</p>
                            <p className="text-sm font-mono truncate">{connectionInfo.n8nFallbackUrl}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/50">
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Nenhum webhook n8n configurado
                    </span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Custom Webhooks */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium flex items-center gap-2">
                    <Webhook className="h-4 w-4" />
                    Webhooks Personalizados
                  </Label>
                  <Button variant="outline" size="sm" asChild>
                    <a href="/ferramentas/webhooks" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Gerenciar Webhooks
                    </a>
                  </Button>
                </div>

                {connectionInfo?.webhooks && connectionInfo.webhooks.length > 0 ? (
                  <div className="space-y-2">
                    {connectionInfo.webhooks.map((webhook) => (
                      <div
                        key={webhook.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {webhook.isActive ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-mono truncate">{webhook.url}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-[10px]">
                                {webhook.events.length} evento(s)
                              </Badge>
                              {webhook.lastStatus && (
                                <Badge
                                  variant={webhook.lastStatus === 'success' ? 'default' : 'destructive'}
                                  className="text-[10px]"
                                >
                                  {webhook.lastStatus}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/50">
                    <Webhook className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Nenhum webhook personalizado configurado
                    </span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Webhook URL Info */}
              <div className="space-y-4">
                <Label className="text-base font-medium">URL para Receber Webhooks</Label>
                <div className="p-3 rounded-lg border bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-2">
                    Use esta URL para configurar webhooks externos que enviam dados para esta integracao:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded bg-background text-sm font-mono truncate">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/webhooks/uazapi/{instanceId}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const url = `${window.location.origin}/api/v1/webhooks/uazapi/${instanceId}`;
                        navigator.clipboard.writeText(url);
                        toast.success('URL copiada!');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Groups Info */}
              <Separator />
              <div className="space-y-4">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Grupos WhatsApp
                </Label>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    O suporte a grupos WhatsApp esta disponivel. Configure o modo de operacao
                    (Desativado, Apenas Monitorar, ou Ativo) nas configuracoes da organizacao.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
