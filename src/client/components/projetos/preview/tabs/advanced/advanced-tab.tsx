"use client"

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
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import {
  DEFAULT_DEEPGRAM_VOICE_ID,
  DEFAULT_ELEVENLABS_VOICE_ID,
} from "@/lib/agent-runtime-settings"
import type {
  PreviewTab,
  WorkspaceProject,
} from "@/client/components/projetos/types"
import { NumberSettingInput, SectionTitle, SwitchCard } from "./advanced-controls"
import { IntegrationsSection } from "./integrations-section"
import { useAdvancedSettings } from "./use-advanced-settings"

interface AdvancedTabProps {
  project: WorkspaceProject
  onTabChange: (tab: PreviewTab) => void
}

export function AdvancedTab({ project, onTabChange }: AdvancedTabProps) {
  const { tokens } = useAppTokens()
  const { settings, dirty, saving, update, save } = useAdvancedSettings(
    project.id,
    project.runtimeSettings,
  )

  const isDeepgram = settings.tts.provider === "deepgram"
  const providerLabel = isDeepgram ? "Deepgram" : "ElevenLabs"

  // Mesmo predicado de isProjectPublished (tab-registry) — importar de lá
  // criaria ciclo, já que o registry importa este componente.
  const published =
    project.hasWhatsAppConnection || project.status === "production"

  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 flex flex-col gap-6 py-2 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold" style={{ color: tokens.textPrimary }}>
              Configurações avançadas
            </h3>
            <Badge variant={published ? "secondary" : "outline"}>
              {published ? "Agente publicado" : "Agente em rascunho"}
            </Badge>
          </div>
          <p className="max-w-2xl text-[13px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            Ajustes que mudam como o runtime recebe mensagens, prepara contexto e responde no WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs" style={{ color: tokens.textTertiary }}>
              Alterações não salvas
            </span>
          )}
          <Button
            type="button"
            size="sm"
            className="gap-2"
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Salvar
          </Button>
        </div>
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
              Janela (em segundos) para esperar novas mensagens antes de enviar tudo ao agente.
            </p>
          </div>
          <NumberSettingInput
            value={Math.round(settings.messageBuffer.timeoutMs / 1000)}
            min={1}
            max={30}
            aria-label="Tempo de concatenação em segundos"
            onCommit={(seconds) =>
              update((draft) => {
                draft.messageBuffer.timeoutMs = seconds * 1000
              })
            }
          />
        </div>

        <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_220px]" style={{ borderColor: tokens.divider }}>
          <div className="space-y-1">
            <Label className="text-xs font-medium" style={{ color: tokens.textPrimary }}>
              Máximo de mensagens por rajada
            </Label>
            <p className="text-xs" style={{ color: tokens.textSecondary }}>
              Quantas mensagens seguidas o buffer junta antes de chamar a IA, mesmo sem atingir o tempo.
            </p>
          </div>
          <NumberSettingInput
            value={settings.messageBuffer.maxMessages}
            min={2}
            max={20}
            aria-label="Máximo de mensagens por rajada"
            onCommit={(count) =>
              update((draft) => {
                draft.messageBuffer.maxMessages = count
              })
            }
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
            badge={providerLabel}
            onChange={(value) => update((draft) => { draft.tts.enabled = value })}
          />

          <div className="rounded-lg border p-4" style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}>
            <div className="space-y-2">
              <Label htmlFor="tts-provider">Provedor de voz</Label>
              <Select
                value={settings.tts.provider}
                onValueChange={(value) =>
                  update((draft) => {
                    const provider = value === "deepgram" ? "deepgram" : "elevenlabs"
                    if (draft.tts.provider === provider) return
                    draft.tts.provider = provider
                    // Troca a voz só se ainda for o default do outro provider —
                    // nunca sobrescreve uma voz que o usuário customizou.
                    if (provider === "deepgram" && draft.tts.voiceId === DEFAULT_ELEVENLABS_VOICE_ID) {
                      draft.tts.voiceId = DEFAULT_DEEPGRAM_VOICE_ID
                    } else if (provider === "elevenlabs" && draft.tts.voiceId === DEFAULT_DEEPGRAM_VOICE_ID) {
                      draft.tts.voiceId = DEFAULT_ELEVENLABS_VOICE_ID
                    }
                  })
                }
              >
                <SelectTrigger id="tts-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  <SelectItem value="deepgram">Deepgram (Aura)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {!isDeepgram && (
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
              )}

              <div className="space-y-2">
                <Label htmlFor="tts-voice">{isDeepgram ? "Voz (Aura)" : "Voice ID"}</Label>
                <Input
                  id="tts-voice"
                  value={settings.tts.voiceId}
                  placeholder={isDeepgram ? "aura-2-theia-en" : undefined}
                  onChange={(event) => update((draft) => { draft.tts.voiceId = event.target.value })}
                  spellCheck={false}
                />
                {isDeepgram && (
                  <p className="text-[11px]" style={{ color: tokens.textTertiary }}>
                    As vozes Aura do Deepgram não cobrem português — para
                    respostas em PT-BR, prefira ElevenLabs.
                  </p>
                )}
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
            Configure a chave {providerLabel} na aba Config antes de ativar áudio em produção.
            <Button
              type="button"
              variant="link"
              className="ml-1 h-auto p-0 text-xs"
              onClick={() => onTabChange("credentials")}
            >
              Abrir Config
            </Button>
          </AlertDescription>
        </Alert>
      </section>

      <IntegrationsSection projectId={project.id} />
    </div>
  )
}
