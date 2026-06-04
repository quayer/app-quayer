"use client"

import * as React from "react"
import {
  FileText,
  ImageIcon,
  Keyboard,
  Languages,
  Loader2,
  Mic,
  Save,
  Timer,
  Video,
  Volume2,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert"
import { Badge } from "@/client/components/ui/badge"
import { Button } from "@/client/components/ui/button"
import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select"
import { Slider } from "@/client/components/ui/slider"
import { Switch } from "@/client/components/ui/switch"
import { getCsrfHeaders } from "@/client/hooks/use-csrf-token"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import {
  DEFAULT_AGENT_RUNTIME_SETTINGS,
  type AgentRuntimeSettings,
} from "@/lib/agent-runtime-settings"
import type {
  PreviewTab,
  WorkspaceProject,
} from "@/client/components/projetos/types"

interface AdvancedTabProps {
  project: WorkspaceProject
  onTabChange: (tab: PreviewTab) => void
}

function cloneSettings(settings: AgentRuntimeSettings): AgentRuntimeSettings {
  return JSON.parse(JSON.stringify(settings)) as AgentRuntimeSettings
}

function mergeDefaults(settings: AgentRuntimeSettings | null | undefined): AgentRuntimeSettings {
  return {
    ...cloneSettings(DEFAULT_AGENT_RUNTIME_SETTINGS),
    ...(settings ?? {}),
    messageBuffer: {
      ...DEFAULT_AGENT_RUNTIME_SETTINGS.messageBuffer,
      ...(settings?.messageBuffer ?? {}),
    },
    media: {
      ...DEFAULT_AGENT_RUNTIME_SETTINGS.media,
      ...(settings?.media ?? {}),
    },
    tts: {
      ...DEFAULT_AGENT_RUNTIME_SETTINGS.tts,
      ...(settings?.tts ?? {}),
    },
  }
}

export function AdvancedTab({ project, onTabChange }: AdvancedTabProps) {
  const { tokens } = useAppTokens()
  const [settings, setSettings] = React.useState<AgentRuntimeSettings>(() =>
    mergeDefaults(project.runtimeSettings),
  )
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setSettings(mergeDefaults(project.runtimeSettings))
  }, [project.runtimeSettings])

  const update = React.useCallback(
    (recipe: (draft: AgentRuntimeSettings) => void) => {
      setSettings((current) => {
        const next = cloneSettings(current)
        recipe(next)
        return next
      })
    },
    [],
  )

  const save = React.useCallback(async () => {
    setSaving(true)
    try {
      const response = await fetch(
        `/api/v1/builder/projects/${project.id}/agent-settings`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            ...getCsrfHeaders(),
          },
          body: JSON.stringify(settings),
        },
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          message?: string
          error?: string
        }
        throw new Error(body.message || body.error || `Erro ${response.status}`)
      }

      const body = (await response.json()) as {
        data?: AgentRuntimeSettings
      }
      if (body.data) setSettings(mergeDefaults(body.data))
      toast.success("Configurações salvas")
    } catch (err) {
      toast.error((err as Error).message || "Erro ao salvar configurações")
    } finally {
      setSaving(false)
    }
  }, [project.id, settings])

  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 flex flex-col gap-6 py-2 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold" style={{ color: tokens.textPrimary }}>
              Configurações avançadas
            </h3>
            <Badge variant="secondary">Agente publicado</Badge>
          </div>
          <p className="max-w-2xl text-[13px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            Ajustes que mudam como o runtime recebe mensagens, prepara contexto e responde no WhatsApp.
          </p>
        </div>

        <Button type="button" size="sm" className="gap-2" onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Salvar
        </Button>
      </div>

      <section className="space-y-3">
        <SectionTitle title="Entrada e contexto" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SwitchCard
            icon={Timer}
            title="Buffer de mensagens"
            description="Concatena rajadas antes de chamar a IA."
            enabled={settings.messageBuffer.enabled}
            badge="Padrão ligado"
            onChange={(value) => update((draft) => { draft.messageBuffer.enabled = value })}
          />
          <SwitchCard
            icon={Keyboard}
            title="Digitando"
            description="Mostra presença de digitação antes da resposta."
            enabled={settings.typingIndicatorEnabled}
            badge="Padrão ligado"
            onChange={(value) => update((draft) => { draft.typingIndicatorEnabled = value })}
          />
          <SwitchCard
            icon={Languages}
            title="Detectar idioma"
            description="Inclui o idioma detectado no contexto do agente."
            enabled={settings.languageDetectionEnabled}
            badge="Padrão desligado"
            onChange={(value) => update((draft) => { draft.languageDetectionEnabled = value })}
          />
        </div>

        <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_220px]" style={{ borderColor: tokens.divider }}>
          <div className="space-y-1">
            <Label className="text-xs font-medium" style={{ color: tokens.textPrimary }}>
              Tempo de concatenação
            </Label>
            <p className="text-xs" style={{ color: tokens.textSecondary }}>
              Janela para esperar novas mensagens antes de enviar tudo ao agente.
            </p>
          </div>
          <Input
            type="number"
            min={1}
            max={30}
            value={Math.round(settings.messageBuffer.timeoutMs / 1000)}
            onChange={(event) => {
              const seconds = Number(event.target.value)
              update((draft) => {
                draft.messageBuffer.timeoutMs = Math.min(30000, Math.max(1000, seconds * 1000))
              })
            }}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="Entendimento multimodal" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SwitchCard
            icon={Mic}
            title="Áudio recebido"
            description="Transcreve áudio antes da resposta."
            enabled={settings.media.audioTranscriptionEnabled}
            badge="Usa Whisper"
            onChange={(value) => update((draft) => { draft.media.audioTranscriptionEnabled = value })}
          />
          <SwitchCard
            icon={ImageIcon}
            title="Imagem recebida"
            description="Descreve imagem para o agente."
            enabled={settings.media.imageUnderstandingEnabled}
            badge="Consome tokens"
            onChange={(value) => update((draft) => { draft.media.imageUnderstandingEnabled = value })}
          />
          <SwitchCard
            icon={FileText}
            title="Documento"
            description="Analisa anexos quando possível."
            enabled={settings.media.documentUnderstandingEnabled}
            badge="Consome tokens"
            onChange={(value) => update((draft) => { draft.media.documentUnderstandingEnabled = value })}
          />
          <SwitchCard
            icon={Video}
            title="Vídeo"
            description="Mantém vídeo no contexto de mídia."
            enabled={settings.media.videoUnderstandingEnabled}
            badge="Padrão ligado"
            onChange={(value) => update((draft) => { draft.media.videoUnderstandingEnabled = value })}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="Callback de áudio" />
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
          <SwitchCard
            icon={Volume2}
            title="Responder com voz"
            description="Converte blocos de texto em áudio antes do envio."
            enabled={settings.tts.enabled}
            badge="ElevenLabs"
            onChange={(value) => update((draft) => { draft.tts.enabled = value })}
          />

          <div className="rounded-lg border p-4" style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tts-model">Modelo</Label>
                <Select
                  value={settings.tts.model}
                  onValueChange={(value) => update((draft) => { draft.tts.model = value })}
                >
                  <SelectTrigger id="tts-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eleven_flash_v2_5">Flash v2.5</SelectItem>
                    <SelectItem value="eleven_multilingual_v2">Multilingual v2</SelectItem>
                    <SelectItem value="eleven_v3">Eleven v3</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tts-voice">Voice ID</Label>
                <Input
                  id="tts-voice"
                  value={settings.tts.voiceId}
                  onChange={(event) => update((draft) => { draft.tts.voiceId = event.target.value })}
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Velocidade</Label>
                <span className="text-xs" style={{ color: tokens.textTertiary }}>
                  {settings.tts.speechRate.toFixed(1)}x
                </span>
              </div>
              <Slider
                min={0.7}
                max={1.3}
                step={0.1}
                value={[settings.tts.speechRate]}
                onValueChange={([value]) => update((draft) => { draft.tts.speechRate = value ?? 1 })}
              />
            </div>
          </div>
        </div>

        <Alert>
          <Volume2 className="h-4 w-4" />
          <AlertTitle>Credencial de voz</AlertTitle>
          <AlertDescription>
            Configure a chave ElevenLabs na aba Credenciais antes de ativar áudio em produção.
            <Button
              type="button"
              variant="link"
              className="ml-1 h-auto p-0 text-xs"
              onClick={() => onTabChange("credentials")}
            >
              Abrir credenciais
            </Button>
          </AlertDescription>
        </Alert>
      </section>
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  const { tokens } = useAppTokens()
  return (
    <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: tokens.textTertiary }}>
      {title}
    </h4>
  )
}

function SwitchCard({
  icon: Icon,
  title,
  description,
  enabled,
  badge,
  onChange,
}: {
  icon: React.ElementType
  title: string
  description: string
  enabled: boolean
  badge: string
  onChange: (value: boolean) => void
}) {
  const { tokens } = useAppTokens()
  return (
    <article
      className="flex min-h-[120px] flex-col justify-between rounded-lg border p-4"
      style={{
        borderColor: enabled ? tokens.brand : tokens.divider,
        backgroundColor: tokens.bgSurface,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: tokens.bgElevated, color: tokens.textSecondary }}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </div>
        <Switch checked={enabled} onCheckedChange={onChange} aria-label={title} />
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h5 className="text-sm font-medium" style={{ color: tokens.textPrimary }}>
            {title}
          </h5>
          <Badge variant={enabled ? "secondary" : "outline"}>{enabled ? "Ativo" : "Inativo"}</Badge>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: tokens.textSecondary }}>
          {description}
        </p>
        <p className="text-[11px]" style={{ color: tokens.textTertiary }}>
          {badge}
        </p>
      </div>
    </article>
  )
}
