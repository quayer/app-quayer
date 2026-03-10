'use client'

/**
 * ShareModal Component
 * Modal to generate and display shareable link for instance
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Copy, CheckCircle, Share2, Loader2, ExternalLink } from 'lucide-react'
import { api } from '@/igniter.client'
import type { Instance } from '@prisma/client'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  instance: Instance | null
}

export function ShareModal({ isOpen, onClose, instance }: ShareModalProps) {
  const [shareUrl, setShareUrl] = useState<string>('')
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string>('')

  const handleGenerate = async () => {
    if (!instance) return

    setIsGenerating(true)
    setError('')

    try {
      const response = await api.share.generate.mutate({
        body: {
          instanceId: instance.id,
          expiresInHours: 24,
        }
      })

      if (response.data) {
        setShareUrl((response.data as any).url)
        setExpiresAt((response.data as any).expiresAt)
      } else {
        setError('Erro ao gerar link')
      }
    } catch (err: any) {
      setError('Erro ao gerar link')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopy = async () => {
    if (!shareUrl) return

    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleOpenInNewTab = () => {
    if (!shareUrl) return
    window.open(shareUrl, '_blank')
  }

  const handleClose = () => {
    setShareUrl('')
    setExpiresAt(null)
    setError('')
    setCopied(false)
    onClose()
  }

  const formatExpiresAt = () => {
    if (!expiresAt) return ''
    const date = new Date(expiresAt)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-theme-primary" />
            Compartilhar Instância
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {instance?.name && `Gerar link para conectar: ${instance.name}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!shareUrl ? (
            <div className="space-y-4">
              <Alert className="bg-blue-500/10 border-blue-500/20">
                <AlertDescription className="text-sm text-gray-300">
                  Este link permitirá que o cliente conecte o WhatsApp desta instância de forma
                  segura. O link expira em 24 horas.
                </AlertDescription>
              </Alert>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full bg-theme-primary hover:bg-theme-primary-hover"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Share2 className="mr-2 h-4 w-4" />
                    Gerar Link de Compartilhamento
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="share-url" className="text-gray-300">
                  Link de Compartilhamento
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="share-url"
                    value={shareUrl}
                    readOnly
                    className="bg-gray-900 border-gray-600 text-white font-mono text-sm"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopy}
                    className="border-gray-600 hover:bg-gray-700 flex-shrink-0"
                  >
                    {copied ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {expiresAt && (
                <Alert className="bg-yellow-500/10 border-yellow-500/20">
                  <AlertDescription className="text-sm text-gray-300">
                    <strong>Expira em:</strong> {formatExpiresAt()}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  className="flex-1 border-gray-600 hover:bg-gray-700"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4 text-green-400" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copiar Link
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleOpenInNewTab}
                  variant="outline"
                  className="flex-1 border-gray-600 hover:bg-gray-700"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Visualizar
                </Button>
              </div>

              <Alert className="bg-green-500/10 border-green-500/20">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-sm text-gray-300">
                  Link gerado com sucesso! Envie este link para o cliente para que ele possa
                  conectar o WhatsApp.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}