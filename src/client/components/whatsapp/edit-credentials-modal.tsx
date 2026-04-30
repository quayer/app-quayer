"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/client/components/ui/dialog"
import { Button } from "@/client/components/ui/button"
import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import { Loader2, ExternalLink, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import { useUpdateCredentials } from "@/client/hooks/useInstance"
import { BrokerType } from "@/server/communication/instances/instances.interfaces"

interface EditCredentialsModalProps {
  isOpen: boolean
  onClose: () => void
  instanceId: string
  instanceName: string
  brokerType: string
}

export function EditCredentialsModal({
  isOpen,
  onClose,
  instanceId,
  instanceName,
  brokerType,
}: EditCredentialsModalProps) {
  const isInstagram =
    brokerType === BrokerType.INSTAGRAM ||
    brokerType === "INSTAGRAM" ||
    brokerType === "INSTAGRAM_META"

  // CloudAPI fields
  const [accessToken, setAccessToken] = useState("")
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [wabaId, setWabaId] = useState("")

  // Instagram fields
  const [igAccessToken, setIgAccessToken] = useState("")
  const [igAccountId, setIgAccountId] = useState("")
  const [pageId, setPageId] = useState("")

  const [saved, setSaved] = useState(false)

  const updateMutation = useUpdateCredentials()

  function handleClose() {
    setAccessToken("")
    setPhoneNumberId("")
    setWabaId("")
    setIgAccessToken("")
    setIgAccountId("")
    setPageId("")
    setSaved(false)
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (isInstagram) {
      if (!igAccessToken.trim() || !igAccountId.trim()) {
        toast.error("Preencha Access Token e Account ID")
        return
      }
      await updateMutation.mutateAsync({
        id: instanceId,
        data: {
          brokerType: BrokerType.INSTAGRAM,
          accessToken: igAccessToken.trim(),
          instagramAccountId: igAccountId.trim(),
          pageId: pageId.trim() || undefined,
        },
      })
    } else {
      if (!accessToken.trim() || !phoneNumberId.trim() || !wabaId.trim()) {
        toast.error("Preencha todos os campos obrigatórios")
        return
      }
      await updateMutation.mutateAsync({
        id: instanceId,
        data: {
          brokerType: BrokerType.CLOUDAPI,
          accessToken: accessToken.trim(),
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim(),
        },
      })
    }

    setSaved(true)
    toast.success("Credenciais atualizadas com sucesso")
    setTimeout(handleClose, 1200)
  }

  const loading = updateMutation.isPending

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Atualizar credenciais — {instanceName}
          </DialogTitle>
        </DialogHeader>

        {saved ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle className="h-10 w-10 text-green-500" />
            <p className="text-sm font-medium text-foreground">Credenciais salvas!</p>
            <p className="text-xs text-muted-foreground">Canal marcado como Conectado.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {isInstagram ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
                    Credenciais Instagram
                  </p>
                  <a
                    href="https://developers.facebook.com/docs/instagram-api/getting-started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-blue-500 hover:underline"
                  >
                    Como obter <ExternalLink size={10} />
                  </a>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-2">
                  Acesse o Meta Business Suite → Instagram → Configurações de API.
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="ig-access-token" className="text-xs">Access Token *</Label>
                  <Input
                    id="ig-access-token"
                    placeholder="EAAxxxxxxxxxxxxxxx"
                    value={igAccessToken}
                    onChange={(e) => setIgAccessToken(e.target.value)}
                    className="text-sm"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ig-account-id" className="text-xs">Instagram Account ID *</Label>
                  <Input
                    id="ig-account-id"
                    placeholder="17841xxxxxxxxxx"
                    value={igAccountId}
                    onChange={(e) => setIgAccountId(e.target.value)}
                    className="text-sm"
                    required
                    disabled={loading}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Account ID aparece na URL do perfil profissional.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="page-id" className="text-xs">Page ID (opcional)</Label>
                  <Input
                    id="page-id"
                    placeholder="10xxxxxxxxxx"
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    className="text-sm"
                    disabled={loading}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
                    Credenciais Meta Business
                  </p>
                  <a
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-blue-500 hover:underline"
                  >
                    Como obter <ExternalLink size={10} />
                  </a>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-2">
                  Acesse o Meta Business Suite → WhatsApp → Configurações da API para encontrar esses dados.
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="access-token" className="text-xs">Access Token *</Label>
                  <Input
                    id="access-token"
                    placeholder="EAAxxxxxxxxxxxxxxx"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    className="text-sm"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone-number-id" className="text-xs">Phone Number ID *</Label>
                  <Input
                    id="phone-number-id"
                    placeholder="100xxxxxxxxxx"
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    className="text-sm"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="waba-id" className="text-xs">WABA ID *</Label>
                  <Input
                    id="waba-id"
                    placeholder="100xxxxxxxxxx"
                    value={wabaId}
                    onChange={(e) => setWabaId(e.target.value)}
                    className="text-sm"
                    required
                    disabled={loading}
                  />
                </div>
              </>
            )}

            {updateMutation.isError && (
              <p className="text-xs text-destructive">
                {(updateMutation.error as Error)?.message ?? "Erro ao salvar credenciais"}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleClose}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="flex-1"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Validando…
                  </>
                ) : (
                  "Salvar credenciais"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
