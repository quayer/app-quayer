'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/igniter.client'

interface DownloadInvoiceButtonProps {
  invoiceId: string
  invoiceNumber: string
}

export function DownloadInvoiceButton({ invoiceId, invoiceNumber }: DownloadInvoiceButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleDownload = async () => {
    try {
      setLoading(true)
      const result = await api.invoices.download.query({
        params: { id: invoiceId },
      })
      const payload = (result as unknown as {
        data?: { pdfBase64?: string; filename?: string; pdfUrl?: string }
      }).data

      if (payload?.pdfUrl) {
        window.open(payload.pdfUrl, '_blank', 'noopener,noreferrer')
        return
      }

      if (payload?.pdfBase64) {
        const byteCharacters = atob(payload.pdfBase64)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const bytes = new Uint8Array(byteNumbers)
        const blob = new Blob([bytes], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = payload.filename ?? `fatura-${invoiceNumber}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return
      }

      toast.error('PDF indisponível para esta fatura.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao baixar o PDF.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleDownload}
      disabled={loading}
      aria-label={`Baixar fatura ${invoiceNumber}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
    </Button>
  )
}
