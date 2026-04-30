'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/client/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/client/components/ui/form'
import { Input } from '@/client/components/ui/input'
import { Button } from '@/client/components/ui/button'
import { Loader2, Plus, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react'
import { useCreateInstance } from '@/client/hooks/useInstance'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import { BrokerType } from '@/server/communication/instances/instances.interfaces'
import { ChannelPickerCard } from '@/client/components/projetos/cards/channel-picker-card'
import type { ModalInstance } from '@/types/instance'
import type { CreateInstanceInput } from '@/server/communication/instances/instances.interfaces'

// ── Types ─────────────────────────────────────────────────────────────────────

type ChannelType = 'cloudapi' | 'uazapi' | 'instagram'
type WizardStep = 'pick' | 'configure'

interface InstagramValidation {
  state: 'idle' | 'checking' | 'valid' | 'error'
  username?: string | null
  name?: string | null
  profilePictureUrl?: string | null
  error?: string
}

export interface CreateInstanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  /** Called when a UAZapi channel is created so parent can open the QR modal. */
  onCreated?: (instance: ModalInstance) => void
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const baseSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório').max(100, 'Máximo 100 caracteres'),
})

const uazapiSchema = baseSchema.extend({
  phoneNumber: z.string().optional(),
})

const cloudapiSchema = baseSchema.extend({
  accessToken: z.string().min(1, 'Access Token obrigatório'),
  phoneNumberId: z.string().min(1, 'Phone Number ID obrigatório'),
  wabaId: z.string().min(1, 'WABA ID obrigatório'),
  phoneNumber: z.string().optional(),
})

const instagramSchema = baseSchema.extend({
  accessToken: z.string().min(1, 'Access Token obrigatório'),
  instagramAccountId: z.string().min(1, 'Instagram Account ID obrigatório'),
  pageId: z.string().optional(),
})

type UazapiForm = z.infer<typeof uazapiSchema>
type CloudApiForm = z.infer<typeof cloudapiSchema>
type InstagramForm = z.infer<typeof instagramSchema>

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateInstanceModal({
  isOpen,
  onClose,
  onSuccess,
  onCreated,
}: CreateInstanceModalProps) {
  const { tokens } = useAppTokens()
  const createMutation = useCreateInstance()

  const [step, setStep] = useState<WizardStep>('pick')
  const [channelType, setChannelType] = useState<ChannelType | null>(null)
  const [igValidation, setIgValidation] = useState<InstagramValidation>({ state: 'idle' })

  const uazapiForm = useForm<UazapiForm>({
    resolver: zodResolver(uazapiSchema),
    defaultValues: { name: '', phoneNumber: '' },
  })
  const cloudapiForm = useForm<CloudApiForm>({
    resolver: zodResolver(cloudapiSchema),
    defaultValues: { name: '', accessToken: '', phoneNumberId: '', wabaId: '', phoneNumber: '' },
  })
  const instagramForm = useForm<InstagramForm>({
    resolver: zodResolver(instagramSchema),
    defaultValues: { name: '', accessToken: '', instagramAccountId: '', pageId: '' },
  })

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function resetAll() {
    setStep('pick')
    setChannelType(null)
    setIgValidation({ state: 'idle' })
    uazapiForm.reset()
    cloudapiForm.reset()
    instagramForm.reset()
  }

  function handleClose() {
    if (!createMutation.isPending) {
      resetAll()
      onClose()
    }
  }

  function handleBack() {
    resetAll()
  }

  function handleSelectType(type: ChannelType) {
    setChannelType(type)
    setStep('configure')
  }

  // ── Instagram live validation ─────────────────────────────────────────────

  async function validateInstagram() {
    const values = instagramForm.getValues()
    const valid = await instagramForm.trigger(['accessToken', 'instagramAccountId'])
    if (!valid) return

    setIgValidation({ state: 'checking' })
    try {
      const res = await fetch('/api/v1/instances/validate-instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: values.accessToken,
          instagramAccountId: values.instagramAccountId,
          pageId: values.pageId || undefined,
        }),
      })
      const data = await res.json() as {
        valid: boolean
        username?: string | null
        name?: string | null
        profilePictureUrl?: string | null
        error?: string
      }
      if (data.valid) {
        setIgValidation({
          state: 'valid',
          username: data.username,
          name: data.name,
          profilePictureUrl: data.profilePictureUrl,
        })
      } else {
        setIgValidation({ state: 'error', error: data.error || 'Credenciais inválidas' })
      }
    } catch {
      setIgValidation({ state: 'error', error: 'Erro ao verificar credenciais' })
    }
  }

  // ── Submit handlers ───────────────────────────────────────────────────────

  async function submitUazapi(data: UazapiForm) {
    try {
      const payload: CreateInstanceInput = {
        name: data.name,
        brokerType: BrokerType.UAZAPI,
        ...(data.phoneNumber && { phoneNumber: data.phoneNumber }),
      }
      const created = await createMutation.mutateAsync(payload)
      toast.success('Canal criado. Conecte via QR Code.')
      onSuccess?.()
      if (created) {
        const inst = created as Record<string, unknown>
        onCreated?.({
          id: inst.id as string,
          name: inst.name as string,
          phoneNumber: (inst.phoneNumber as string | null) ?? null,
          status: (inst.status as string) ?? 'CREATED',
          brokerType: 'UAZAPI',
          createdAt: inst.createdAt as string,
          uazapiToken: (inst.uazapiToken as string | null) ?? null,
          brokerId: (inst.brokerId as string | null) ?? null,
        })
      }
      handleClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar canal')
    }
  }

  async function submitCloudApi(data: CloudApiForm) {
    try {
      const payload: CreateInstanceInput = {
        name: data.name,
        brokerType: BrokerType.CLOUDAPI,
        accessToken: data.accessToken,
        phoneNumberId: data.phoneNumberId,
        wabaId: data.wabaId,
        ...(data.phoneNumber && { phoneNumber: data.phoneNumber }),
      }
      await createMutation.mutateAsync(payload)
      toast.success('Canal WhatsApp Cloud API conectado.')
      onSuccess?.()
      handleClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar canal')
    }
  }

  async function submitInstagram(data: InstagramForm) {
    if (igValidation.state !== 'valid') {
      toast.error('Verifique as credenciais antes de salvar')
      return
    }
    try {
      const payload: CreateInstanceInput = {
        name: data.name,
        brokerType: BrokerType.INSTAGRAM,
        accessToken: data.accessToken,
        instagramAccountId: data.instagramAccountId,
        ...(data.pageId && { pageId: data.pageId }),
      }
      await createMutation.mutateAsync(payload)
      toast.success('Canal Instagram Direct conectado.')
      onSuccess?.()
      handleClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar canal')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isSubmitting = createMutation.isPending

  const title: Record<WizardStep | ChannelType, string> = {
    pick: 'Novo Canal',
    configure: 'Novo Canal',
    uazapi: 'WhatsApp Business',
    cloudapi: 'WhatsApp Cloud API',
    instagram: 'Instagram Direct',
  }

  const dialogTitle = step === 'pick' ? title.pick : title[channelType!]

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {step === 'configure' && (
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="rounded p-0.5 hover:bg-muted/50 transition-colors disabled:opacity-40"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            {step === 'pick' && (
              <div className="rounded-lg bg-primary/10 p-1.5">
                <Plus className="h-4 w-4 text-primary" />
              </div>
            )}
            {dialogTitle}
          </DialogTitle>
          {step === 'pick' && (
            <DialogDescription className="text-xs">
              Escolha o tipo de canal para conectar à sua organização.
            </DialogDescription>
          )}
        </DialogHeader>

        {/* ── Step 1: tipo ─────────────────────────────────────────────── */}
        {step === 'pick' && (
          <ChannelPickerCard
            tokens={tokens}
            selected={channelType ?? undefined}
            onSelect={(type) => handleSelectType(type as ChannelType)}
          />
        )}

        {/* ── Step 2a: WhatsApp Business (UAZapi) ──────────────────────── */}
        {step === 'configure' && channelType === 'uazapi' && (
          <Form {...uazapiForm}>
            <form onSubmit={uazapiForm.handleSubmit(submitUazapi)} className="space-y-4 pt-1">
              <FormField
                control={uazapiForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">
                      Nome <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex: Suporte Principal" disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={uazapiForm.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">Número (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="5511999999999"
                        disabled={isSubmitting}
                        className="font-mono text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className="text-[11px] text-muted-foreground rounded-lg border border-border/30 bg-muted/10 p-3">
                Após criar, você escaneará um QR Code para parear com o WhatsApp no celular.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={handleBack} disabled={isSubmitting}>
                  Voltar
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting} className="flex-1">
                  {isSubmitting
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Criando...</>
                    : 'Criar e conectar via QR'
                  }
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* ── Step 2b: WhatsApp Cloud API ───────────────────────────────── */}
        {step === 'configure' && channelType === 'cloudapi' && (
          <Form {...cloudapiForm}>
            <form onSubmit={cloudapiForm.handleSubmit(submitCloudApi)} className="space-y-3 pt-1">
              <FormField
                control={cloudapiForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">
                      Nome <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex: WhatsApp Vendas" disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-lg border border-border/30 bg-muted/10 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Credenciais Meta Business
                  </p>
                  <a
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-primary underline underline-offset-2 hover:opacity-80"
                  >
                    Como obter →
                  </a>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Acesse o <strong>Meta Business Suite → WhatsApp → Configurações da API</strong> para encontrar esses dados.
                </p>
                <FormField
                  control={cloudapiForm.control}
                  name="accessToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">
                        Access Token <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="EAAxxxxxxxx..."
                          disabled={isSubmitting}
                          className="font-mono text-xs"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={cloudapiForm.control}
                  name="phoneNumberId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">
                        Phone Number ID <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="123456789012345"
                          disabled={isSubmitting}
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={cloudapiForm.control}
                  name="wabaId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">
                        WABA ID <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="123456789012345"
                          disabled={isSubmitting}
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={cloudapiForm.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">Número (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="5511999999999"
                        disabled={isSubmitting}
                        className="font-mono text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={handleBack} disabled={isSubmitting}>
                  Voltar
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting} className="flex-1">
                  {isSubmitting
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Conectando...</>
                    : 'Conectar via Cloud API'
                  }
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* ── Step 2c: Instagram Direct ─────────────────────────────────── */}
        {step === 'configure' && channelType === 'instagram' && (
          <Form {...instagramForm}>
            <form onSubmit={instagramForm.handleSubmit(submitInstagram)} className="space-y-3 pt-1">
              <FormField
                control={instagramForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">
                      Nome <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex: Instagram Oficial" disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-lg border border-border/30 bg-muted/10 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Credenciais Meta Graph API
                  </p>
                  <a
                    href="https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-primary underline underline-offset-2 hover:opacity-80"
                  >
                    Como obter →
                  </a>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Acesse o <strong>Meta Business Suite → Instagram → Configurações → API</strong>. O Account ID aparece na URL do perfil profissional.
                </p>
                <FormField
                  control={instagramForm.control}
                  name="accessToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">
                        Access Token <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="EAAxxxxxxxx..."
                          disabled={isSubmitting}
                          className="font-mono text-xs"
                          onChange={(e) => {
                            field.onChange(e)
                            setIgValidation({ state: 'idle' })
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={instagramForm.control}
                  name="instagramAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">
                        Instagram Account ID <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="17841400000000000"
                          disabled={isSubmitting}
                          className="font-mono text-sm"
                          onChange={(e) => {
                            field.onChange(e)
                            setIgValidation({ state: 'idle' })
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={instagramForm.control}
                  name="pageId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Page ID (opcional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="1234567890"
                          disabled={isSubmitting}
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Validation feedback */}
                {igValidation.state === 'idle' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={validateInstagram}
                  >
                    Verificar credenciais
                  </Button>
                )}
                {igValidation.state === 'checking' && (
                  <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Verificando com Meta Graph API…
                  </div>
                )}
                {igValidation.state === 'valid' && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-3">
                    {igValidation.profilePictureUrl ? (
                      <img
                        src={igValidation.profilePictureUrl}
                        alt="profile"
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <CheckCircle className="h-8 w-8 text-emerald-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      {igValidation.username && (
                        <p className="text-[13px] font-semibold text-emerald-600">
                          @{igValidation.username}
                        </p>
                      )}
                      {igValidation.name && (
                        <p className="text-[11px] text-muted-foreground">{igValidation.name}</p>
                      )}
                      <p className="text-[11px] text-emerald-600 font-medium">
                        Credenciais válidas ✓
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIgValidation({ state: 'idle' })}
                      className="ml-auto text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground shrink-0"
                    >
                      alterar
                    </button>
                  </div>
                )}
                {igValidation.state === 'error' && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[12px] text-red-600 font-medium">Credenciais inválidas</p>
                      {igValidation.error && (
                        <p className="text-[11px] text-muted-foreground">{igValidation.error}</p>
                      )}
                      <button
                        type="button"
                        onClick={validateInstagram}
                        className="text-[11px] text-red-500 underline underline-offset-2 mt-1"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={handleBack} disabled={isSubmitting}>
                  Voltar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || igValidation.state !== 'valid'}
                  className="flex-1"
                >
                  {isSubmitting
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Conectando...</>
                    : 'Conectar Instagram'
                  }
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
