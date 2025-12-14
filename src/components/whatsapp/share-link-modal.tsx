'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Copy,
  ExternalLink,
  Share2,
  CheckCircle,
  Clock,
  Shield,
  MessageCircle,
  QrCode,
  Users,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

interface ShareLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  instanceName: string;
}

interface ShareData {
  token: string;
  shareUrl: string;
  expiresAt: Date;
}

export function ShareLinkModal({
  open,
  onOpenChange,
  instanceId,
  instanceName,
}: ShareLinkModalProps) {
  const [loading, setLoading] = useState(false);
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [copied, setCopied] = useState(false);

  const generateShareLink = async () => {
    try {
      setLoading(true);

      const response = await fetch(`/api/v1/instances/${instanceId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Erro ao gerar link de compartilhamento';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorJson.error || errorMessage;
        } catch {
          // Ignore parse error
        }
        throw new Error(errorMessage);
      }

      const text = await response.text();
      if (!text) {
        throw new Error('Resposta vazia do servidor');
      }

      const result = JSON.parse(text);
      const shareToken = result.data?.token || result.token;
      const shareUrl = result.data?.shareUrl || result.shareUrl || `${window.location.origin}/compartilhar/${shareToken}`;
      const expiresAt = new Date(result.data?.expiresAt || result.expiresAt || Date.now() + 3600000);

      setShareData({
        token: shareToken,
        shareUrl,
        expiresAt,
      });
    } catch (error) {
      console.error('Erro ao gerar link:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar link');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareData) return;

    try {
      await navigator.clipboard.writeText(shareData.shareUrl);
      setCopied(true);
      toast.success('Link copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Erro ao copiar link');
    }
  };

  const handleShare = async () => {
    if (!shareData) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Conectar WhatsApp - ${instanceName}`,
          text: 'Use este link para conectar seu WhatsApp',
          url: shareData.shareUrl,
        });
      } catch {
        // User cancelled
      }
    } else {
      handleCopy();
    }
  };

  const handleOpenLink = () => {
    if (shareData) {
      window.open(shareData.shareUrl, '_blank');
    }
  };

  const formatTimeRemaining = (expiresAt: Date) => {
    const diff = expiresAt.getTime() - Date.now();
    if (diff <= 0) return 'Expirado';

    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} minutos`;

    const hours = Math.floor(minutes / 60);
    return `${hours} hora${hours > 1 ? 's' : ''}`;
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setShareData(null);
      setCopied(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-emerald-500" />
            Compartilhar Conexao
          </DialogTitle>
          <DialogDescription>
            Gere um link para que outra pessoa conecte seu WhatsApp a "{instanceName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {!shareData ? (
            <>
              {/* Intro */}
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl p-4 border border-emerald-100">
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-emerald-900 mb-1">Link de Conexao</h4>
                    <p className="text-sm text-emerald-700">
                      Envie este link para o dono do WhatsApp que sera conectado. Ele podera escanear o QR Code ou usar um codigo de pareamento.
                    </p>
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <QrCode className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm">QR Code</span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm">Codigo de Pareamento</span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm">Expira em 1 hora</span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm">Uso unico</span>
                </div>
              </div>

              <Button
                onClick={generateShareLink}
                disabled={loading}
                className="w-full h-12 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando link...
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4 mr-2" />
                    Gerar Link de Compartilhamento
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              {/* Success */}
              <div className="text-center mb-4">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="h-8 w-8 text-emerald-600" />
                </div>
                <h4 className="font-semibold text-lg">Link Gerado!</h4>
                <p className="text-sm text-muted-foreground">
                  Copie e envie este link para conectar o WhatsApp
                </p>
              </div>

              {/* Link display */}
              <div className="space-y-2">
                <Label htmlFor="share-link-input">Link de Conexao</Label>
                <div className="flex gap-2">
                  <Input
                    id="share-link-input"
                    value={shareData.shareUrl}
                    readOnly
                    className="font-mono text-sm"
                    aria-label="Link de compartilhamento gerado"
                    aria-describedby="share-link-expiration"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    className={copied ? 'bg-emerald-50 border-emerald-200' : ''}
                    aria-label={copied ? 'Link copiado!' : 'Copiar link de compartilhamento'}
                  >
                    {copied ? (
                      <CheckCircle className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Expiration */}
              <Alert className="border-amber-200 bg-amber-50" id="share-link-expiration" role="status">
                <Clock className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <AlertDescription className="text-amber-800">
                  Este link expira em <strong>{formatTimeRemaining(shareData.expiresAt)}</strong>.
                  Apos a expiracao, gere um novo link.
                </AlertDescription>
              </Alert>

              {/* Actions */}
              <div className="flex gap-2" role="group" aria-label="Acoes do link de compartilhamento">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleOpenLink}
                  aria-label="Abrir link em nova aba"
                >
                  <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
                  Abrir Link
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600"
                  onClick={handleShare}
                  aria-label="Compartilhar link via sistema nativo ou copiar"
                >
                  <Share2 className="h-4 w-4 mr-2" aria-hidden="true" />
                  Compartilhar
                </Button>
              </div>

              {/* Generate new */}
              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShareData(null)}
                  className="text-muted-foreground"
                >
                  Gerar novo link
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
