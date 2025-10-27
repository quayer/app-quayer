'use client';

/**
 * CreateIntegrationModal - Versão Simplificada
 *
 * Baseado em Nielsen Norman Group Heuristics:
 * - Heurística #1: Visibilidade do status do sistema
 * - Heurística #5: Prevenção de erros
 * - Heurística #8: Design estético e minimalista
 *
 * Melhorias:
 * - Fluxo simplificado (1 step ao invés de 5)
 * - Feedback imediato
 * - Card aparece instantaneamente
 * - Sem elementos fake (QR code)
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Smartphone,
  Shield,
  Info,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface CreateIntegrationModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: CreateIntegrationData) => Promise<{ success: boolean; instanceId: string } | void>;
  isAdmin?: boolean;
}

interface CreateIntegrationData {
  name: string;
  description?: string;
  webhookUrl?: string;
  events: string[];
}

export function CreateIntegrationModalSimplified({
  open,
  onClose,
  onCreate,
  isAdmin = false
}: CreateIntegrationModalProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<CreateIntegrationData>({
    name: '',
    description: '',
    webhookUrl: '',
    events: ['messages', 'connection']
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Nome obrigatório
    if (!formData.name.trim()) {
      newErrors.name = 'Nome é obrigatório';
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'Nome deve ter pelo menos 3 caracteres';
    }

    // Webhook URL (opcional mas se preenchido deve ser válido)
    if (formData.webhookUrl && formData.webhookUrl.trim()) {
      try {
        new URL(formData.webhookUrl);
        if (!formData.webhookUrl.startsWith('http')) {
          newErrors.webhookUrl = 'URL deve começar com http:// ou https://';
        }
      } catch {
        newErrors.webhookUrl = 'URL inválida';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validar formulário
    if (!validateForm()) {
      toast.error('Por favor, corrija os erros antes de continuar');
      return;
    }

    setLoading(true);

    try {
      const result = await onCreate(formData);

      if (result?.success) {
        // ✅ Feedback imediato
        toast.success('✅ Integração criada com sucesso!', {
          description: 'O card aparecerá na lista de integrações'
        });

        // ✅ Fechar modal imediatamente
        handleClose();

        // ✅ Scroll para o topo (onde o card novo aparecerá)
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });

          // ✅ Highlight no card novo (se tiver data-instance-id)
          if (result.instanceId) {
            setTimeout(() => {
              const newCard = document.querySelector(`[data-instance-id="${result.instanceId}"]`);
              if (newCard) {
                newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                newCard.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'transition-all');

                // Remover highlight após 3s
                setTimeout(() => {
                  newCard.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
                }, 3000);
              }
            }, 500);
          }
        }, 300);
      }
    } catch (error: any) {
      // ✅ Mensagens de erro específicas (Heurística #9)
      let errorMessage = 'Erro ao criar integração. Tente novamente.';
      let errorDescription = '';

      if (error.response?.status === 401) {
        errorMessage = 'Sessão expirada';
        errorDescription = 'Faça login novamente para continuar';
      } else if (error.response?.status === 409) {
        errorMessage = 'Nome já existe';
        errorDescription = 'Já existe uma integração com este nome';
      } else if (error.response?.status === 422) {
        errorMessage = 'Dados inválidos';
        errorDescription = 'Verifique os campos e tente novamente';
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage = 'Erro de conexão';
        errorDescription = 'Verifique sua conexão com a internet';
      }

      toast.error(errorMessage, {
        description: errorDescription
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      description: '',
      webhookUrl: '',
      events: ['messages', 'connection']
    });
    setErrors({});
    setLoading(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <span>Nova Integração WhatsApp</span>
          </DialogTitle>
          <DialogDescription>
            Crie uma nova integração WhatsApp Business para começar a gerenciar suas conversas
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Nome da Instância */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Nome da Instância <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, name: e.target.value }));
                // Limpar erro ao digitar
                if (errors.name) {
                  setErrors(prev => ({ ...prev, name: '' }));
                }
              }}
              placeholder="Ex: Loja ABC - Vendas"
              className={errors.name ? 'border-destructive' : ''}
              disabled={loading}
              autoFocus
            />
            {errors.name && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.name}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Escolha um nome descritivo para identificar esta integração
            </p>
          </div>

          {/* Descrição (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Descrição <span className="text-muted-foreground text-xs">(opcional)</span>
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Breve descrição da instância..."
              rows={3}
              disabled={loading}
            />
          </div>

          {/* Webhook URL (somente admin) */}
          {isAdmin && (
            <div className="space-y-2">
              <Label htmlFor="webhookUrl" className="flex items-center gap-2">
                <span>Webhook URL</span>
                <Badge variant="secondary" className="text-xs">
                  <Shield className="h-3 w-3 mr-1" />
                  Admin
                </Badge>
              </Label>
              <Input
                id="webhookUrl"
                type="url"
                value={formData.webhookUrl}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, webhookUrl: e.target.value }));
                  if (errors.webhookUrl) {
                    setErrors(prev => ({ ...prev, webhookUrl: '' }));
                  }
                }}
                placeholder="https://suaapi.com/webhook"
                className={errors.webhookUrl ? 'border-destructive' : ''}
                disabled={loading}
              />
              {errors.webhookUrl && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.webhookUrl}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                URL para receber eventos em tempo real (mensagens, status de conexão, etc)
              </p>
            </div>
          )}

          {/* Info para não-admins */}
          {!isAdmin && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>Configuração de webhook:</strong> Entre em contato com seu administrador
                para configurar webhooks e receber eventos em tempo real.
              </AlertDescription>
            </Alert>
          )}

          {/* Footer com botões */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="min-w-[120px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Integração'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
