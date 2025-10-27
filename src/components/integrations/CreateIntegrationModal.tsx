'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle, 
  ArrowLeft, 
  ArrowRight, 
  Smartphone, 
  MessageSquare,
  Webhook,
  Clock,
  Wifi,
  RefreshCw,
  Share2,
  Copy,
  ExternalLink,
  Link,
  Globe,
  Shield,
  Info,
  Settings
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

type Step = 'channel' | 'config' | 'connect' | 'share' | 'success';

export function CreateIntegrationModal({ open, onClose, onCreate, isAdmin = false }: CreateIntegrationModalProps) {
  const [currentStep, setCurrentStep] = useState<Step>('channel');
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string>('');
  const [instanceId, setInstanceId] = useState<string>('');
  const [formData, setFormData] = useState<CreateIntegrationData>({
    name: '',
    description: '',
    webhookUrl: '',
    events: ['messages', 'connection']
  });

  const steps = [
    { id: 'channel', title: 'Escolher Canal', icon: Smartphone },
    { id: 'config', title: 'Configurar', icon: Settings },
    { id: 'connect', title: 'Conectar', icon: Wifi },
    { id: 'share', title: 'Compartilhar', icon: Share2 },
    { id: 'success', title: 'Concluído', icon: CheckCircle }
  ];

  const handleNext = () => {
    const stepOrder: Step[] = ['channel', 'config', 'connect', 'share', 'success'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      // Se estamos indo de share para success e não temos shareLink, gerar um novo
      if (currentStep === 'share' && !shareLink) {
        const token = generateToken();
        const baseUrl = window.location.origin;
        setShareLink(`${baseUrl}/integracoes/compartilhar/${token}`);
      }
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  };

  const handlePrev = () => {
    const stepOrder: Step[] = ['channel', 'config', 'connect', 'share', 'success'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const result = await onCreate(formData);

      // Usar o ID da instância retornado ou gerar token aleatório
      const instanceIdOrToken = result?.instanceId || generateToken();
      setInstanceId(instanceIdOrToken);

      const baseUrl = window.location.origin;
      setShareLink(`${baseUrl}/integracoes/compartilhar/${instanceIdOrToken}`);

      // Avançar para a próxima etapa
      setCurrentStep('share');
    } catch (error) {
      console.error('Erro ao criar integração:', error);
      toast.error('Erro ao criar integração. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const generateToken = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      toast.success('Link copiado para a área de transferência!');
    } catch (error) {
      toast.error('Erro ao copiar link');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Conectar WhatsApp - ${formData.name}`,
          text: `Conecte sua conta WhatsApp à ${formData.name}`,
          url: shareLink
        });
      } catch (error) {
        console.log('Erro ao compartilhar:', error);
      }
    } else {
      handleCopyLink();
    }
  };

  const handleClose = () => {
    setCurrentStep('channel');
    setFormData({
      name: '',
      description: '',
      webhookUrl: '',
      events: ['messages', 'connection']
    });
    setShareLink('');
    setInstanceId('');
    onClose();
  };

  const currentStepIndex = steps.findIndex(step => step.id === currentStep);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Smartphone className="h-6 w-6 text-primary" />
            <span>Criar Nova Integração WhatsApp Business</span>
          </DialogTitle>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex items-center justify-between mb-6">
          {steps.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = index === currentStepIndex;
            const isCompleted = index < currentStepIndex;
            
            return (
              <div key={step.id} className="flex items-center">
                <div className={`
                  flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors
                  ${isActive ? 'border-primary bg-primary text-primary-foreground' : 
                    isCompleted ? 'border-green-500 bg-green-500 text-white' : 
                    'border-muted bg-background text-muted-foreground'}
                `}>
                  <StepIcon className="h-4 w-4" />
                </div>
                {index < steps.length - 1 && (
                  <div className={`
                    w-12 h-0.5 mx-1 transition-colors
                    ${isCompleted ? 'bg-green-500' : 'bg-muted'}
                  `} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="min-h-[400px]">
          {currentStep === 'channel' && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">Escolha o Canal de Comunicação</h3>
                <p className="text-muted-foreground">
                  Selecione o tipo de integração que deseja criar
                </p>
              </div>

              <Card className="border-2 border-primary bg-primary/5">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <Smartphone className="h-8 w-8 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-lg">WhatsApp Business</h4>
                      <p className="text-muted-foreground mb-3">
                        Conecte sua conta WhatsApp Business para começar
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          <MessageSquare className="h-3 w-3 mr-1" />
                          Envio de mensagens
                        </Badge>
                        <Badge variant="secondary">
                          <Webhook className="h-3 w-3 mr-1" />
                          Recebimento via webhook
                        </Badge>
                        <Badge variant="secondary">
                          📎 Suporte a mídia
                        </Badge>
                        <Badge variant="secondary">
                          ✅ Status de entrega
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep === 'config' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Configurar Instância</h3>
                <p className="text-muted-foreground">
                  Defina as configurações básicas da sua integração
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Nome da Instância *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: Loja ABC - Vendas"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="description">Descrição (opcional)</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Breve descrição da instância..."
                    className="mt-1"
                    rows={3}
                  />
                </div>

                {isAdmin && (
                  <div>
                    <Label htmlFor="webhookUrl" className="flex items-center space-x-2">
                      <span>Webhook URL</span>
                      <Badge variant="secondary" className="text-xs">
                        <Shield className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    </Label>
                    <Input
                      id="webhookUrl"
                      value={formData.webhookUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, webhookUrl: e.target.value }))}
                      placeholder="https://suaapi.com/webhook"
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      URL para receber eventos em tempo real
                    </p>
                  </div>
                )}

                {!isAdmin && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Configuração de webhook:</strong> Disponível apenas para administradores. 
                      Entre em contato com seu administrador para configurar webhooks.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          )}

          {currentStep === 'connect' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Conectar WhatsApp</h3>
                <p className="text-muted-foreground">
                  Escaneie o QR code para vincular sua conta WhatsApp
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-32 h-32 bg-black rounded-lg mx-auto mb-4 flex items-center justify-center">
                        <span className="text-white text-sm">QR Code</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <Clock className="h-4 w-4 inline mr-1" />
                        Expira em: 04:32
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar QR Code
                  </Button>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Instruções:</h4>
                  <ol className="space-y-3 text-sm">
                    <li className="flex items-start space-x-2">
                      <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium">1</span>
                      <span>Abra WhatsApp no seu celular</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium">2</span>
                      <span>Vá em <strong>Configurações</strong></span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium">3</span>
                      <span>Selecione <strong>Aparelhos conectados</strong></span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium">4</span>
                      <span>Toque em <strong>Vincular dispositivo</strong></span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium">5</span>
                      <span>Escaneie o QR code na tela</span>
                    </li>
                  </ol>

                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <Clock className="h-4 w-4 inline mr-1" />
                      Status: Aguardando conexão...
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'share' && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">Compartilhar Conexão</h3>
                <p className="text-muted-foreground">
                  Compartilhe o link para que outros possam conectar seus WhatsApp
                </p>
              </div>

              <Card>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Link className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Link de Compartilhamento</p>
                        <p className="text-sm text-muted-foreground">
                          Qualquer pessoa com este link pode conectar seu WhatsApp
                        </p>
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <Input 
                        value={shareLink} 
                        readOnly 
                        className="font-mono text-sm"
                      />
                      <Button variant="outline" onClick={handleCopyLink}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" onClick={handleShare}>
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 border rounded-lg">
                        <div className="flex items-center space-x-2 mb-2">
                          <Globe className="h-4 w-4 text-blue-600" />
                          <span className="font-medium text-sm">Acesso Público</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Não precisa de login. Qualquer pessoa pode acessar.
                        </p>
                      </div>

                      <div className="p-4 border rounded-lg">
                        <div className="flex items-center space-x-2 mb-2">
                          <Clock className="h-4 w-4 text-orange-600" />
                          <span className="font-medium text-sm">Tempo Limitado</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Link válido por 1 hora. Renovação automática.
                        </p>
                      </div>
                    </div>

                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Dica:</strong> Compartilhe este link via WhatsApp, email ou qualquer outro meio. 
                        A pessoa que receber poderá conectar seu WhatsApp diretamente.
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep === 'success' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">Integração Criada com Sucesso!</h3>
                <p className="text-muted-foreground">
                  Sua instância WhatsApp Business está pronta para uso
                </p>
              </div>

              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <Smartphone className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{formData.name}</p>
                      <p className="text-sm text-muted-foreground">
                        +55 11 99999-9999 • Conectado
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex space-x-2 justify-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (shareLink) {
                      window.open(shareLink, '_blank');
                    } else {
                      toast.error('Link de compartilhamento não disponível');
                    }
                  }}
                  disabled={!shareLink}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir Link de Compartilhamento
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (shareLink) {
                      handleCopyLink();
                    } else {
                      toast.error('Link de compartilhamento não disponível');
                    }
                  }}
                  disabled={!shareLink}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar Link
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex justify-between pt-6 border-t">
          {currentStep !== 'channel' && currentStep !== 'success' && (
            <Button variant="outline" onClick={handlePrev}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          )}
          
          <div className="ml-auto flex space-x-2">
            {currentStep === 'success' ? (
              <Button onClick={handleClose}>
                Concluir
              </Button>
            ) : currentStep === 'share' ? (
              <Button onClick={handleNext}>
                Finalizar
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : currentStep === 'config' ? (
              <Button onClick={handleSubmit} disabled={!formData.name || loading}>
                {loading ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    Criar
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleNext}>
                Próximo
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}