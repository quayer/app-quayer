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
  Settings,
  Cloud,
  Zap,
  XCircle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface CreateIntegrationModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: CreateIntegrationData) => Promise<{ success: boolean; instanceId: string } | void>;
  onSelectQRCode?: (instanceId: string, instanceName: string) => void;
  isAdmin?: boolean;
}

interface CreateIntegrationData {
  name: string;
  description?: string;
  webhookUrl?: string;
  events: string[];
  provider: 'WHATSAPP_WEB' | 'WHATSAPP_CLOUD_API';
  // Cloud API fields
  cloudApiAccessToken?: string;
  cloudApiPhoneNumberId?: string;
  cloudApiWabaId?: string;
}

type Step = 'channel' | 'config' | 'method' | 'connect' | 'share' | 'success';
type ConnectionMethod = 'qrcode' | 'share' | null;

interface CloudApiValidation {
  status: 'idle' | 'validating' | 'valid' | 'invalid';
  phoneNumber?: string;
  verifiedName?: string;
  error?: string;
}

export function CreateIntegrationModal({ open, onClose, onCreate, onSelectQRCode, isAdmin = false }: CreateIntegrationModalProps) {
  const [currentStep, setCurrentStep] = useState<Step>('channel');
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string>('');
  const [instanceId, setInstanceId] = useState<string>('');
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>(null);
  const [cloudApiValidation, setCloudApiValidation] = useState<CloudApiValidation>({ status: 'idle' });
  const [formData, setFormData] = useState<CreateIntegrationData>({
    name: '',
    description: '',
    webhookUrl: '',
    events: ['messages', 'connection'],
    provider: 'WHATSAPP_WEB',
    cloudApiAccessToken: '',
    cloudApiPhoneNumberId: '',
    cloudApiWabaId: ''
  });

  const steps = [
    { id: 'channel', title: 'Canal', icon: Smartphone },
    { id: 'config', title: 'Configurar', icon: Settings },
    { id: 'method', title: 'Método', icon: Wifi },
    { id: 'success', title: 'Concluído', icon: CheckCircle }
  ];

  const handleNext = () => {
    const stepOrder: Step[] = ['channel', 'config', 'method', 'success'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  };

  const handlePrev = () => {
    const stepOrder: Step[] = ['channel', 'config', 'method', 'success'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  };

  const handleValidateCloudApi = async () => {
    if (!formData.cloudApiAccessToken || !formData.cloudApiPhoneNumberId || !formData.cloudApiWabaId) {
      toast.error('Preencha todos os campos de credenciais primeiro');
      return;
    }

    setCloudApiValidation({ status: 'validating' });

    try {
      const response = await fetch('/api/v1/instances/validate-cloud-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cloudApiAccessToken: formData.cloudApiAccessToken,
          cloudApiPhoneNumberId: formData.cloudApiPhoneNumberId,
          cloudApiWabaId: formData.cloudApiWabaId,
        }),
      });

      const result = await response.json();
      const data = result.data || result;

      if (data.valid) {
        setCloudApiValidation({
          status: 'valid',
          phoneNumber: data.phoneNumber,
          verifiedName: data.verifiedName,
        });
        toast.success('Credenciais válidas! Conexão verificada com sucesso.');
      } else {
        setCloudApiValidation({
          status: 'invalid',
          error: data.error || 'Credenciais inválidas',
        });
        toast.error(data.message || 'Credenciais inválidas. Verifique e tente novamente.');
      }
    } catch (error: any) {
      setCloudApiValidation({
        status: 'invalid',
        error: error.message || 'Erro ao validar credenciais',
      });
      toast.error('Erro ao validar credenciais. Tente novamente.');
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const result = await onCreate(formData);

      if (!result?.instanceId) {
        throw new Error('ID da instancia nao retornado');
      }

      setInstanceId(result.instanceId);

      // Se for Cloud API, já está conectado (não tem QR code), ir para sucesso
      if (formData.provider === 'WHATSAPP_CLOUD_API') {
        setCurrentStep('success');
      } else {
        // UAZAPI precisa escolher método de conexão (QR Code ou Link)
        setCurrentStep('method');
      }
    } catch (error: any) {
      console.error('Erro ao criar integração:', JSON.stringify(error, null, 2));
      const errorMessage = error?.response?.data?.message || error?.message || 'Erro ao criar integração.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQRCode = () => {
    setConnectionMethod('qrcode');
    // Notifica a página para abrir o QRCodeModal
    if (onSelectQRCode && instanceId) {
      onSelectQRCode(instanceId, formData.name);
    }
    // Fecha o modal
    handleClose();
  };

  const handleSelectShareLink = async () => {
    if (!instanceId) {
      toast.error('ID da instância não encontrado');
      return;
    }

    setLoading(true);
    try {
      // Chamar API para gerar token de compartilhamento
      const shareResponse = await fetch(`/api/v1/instances/${instanceId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!shareResponse.ok) {
        const errorData = await shareResponse.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Erro ao gerar link de compartilhamento');
      }

      const shareResult = await shareResponse.json();
      const shareUrl = shareResult.data?.shareUrl || shareResult.shareUrl;

      if (!shareUrl) {
        throw new Error('URL de compartilhamento nao foi gerada');
      }

      setShareLink(shareUrl);
      setConnectionMethod('share');
      setCurrentStep('share');
    } catch (error) {
      console.error('Erro ao gerar link:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar link. Tente novamente.');
    } finally {
      setLoading(false);
    }
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
      events: ['messages', 'connection'],
      provider: 'WHATSAPP_WEB',
      cloudApiAccessToken: '',
      cloudApiPhoneNumberId: '',
      cloudApiWabaId: ''
    });
    setShareLink('');
    setInstanceId('');
    setConnectionMethod(null);
    setCloudApiValidation({ status: 'idle' });
    onClose();
  };

  const currentStepIndex = steps.findIndex(step => step.id === currentStep);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Smartphone className="h-6 w-6 text-green-600" />
            <span>Conectar Novo WhatsApp</span>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Opção WhatsApp Web (UAZAPI) */}
                <Card
                  className={`cursor-pointer border-2 transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${formData.provider === 'WHATSAPP_WEB'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-muted hover:border-primary/50'
                    }`}
                  onClick={() => setFormData(prev => ({ ...prev, provider: 'WHATSAPP_WEB' }))}
                  role="radio"
                  aria-checked={formData.provider === 'WHATSAPP_WEB'}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setFormData(prev => ({ ...prev, provider: 'WHATSAPP_WEB' }))}
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center text-center space-y-4">
                      <div className={`p-4 rounded-full transition-colors ${formData.provider === 'WHATSAPP_WEB' ? 'bg-primary/20' : 'bg-muted'}`}>
                        <Smartphone className={`h-8 w-8 ${formData.provider === 'WHATSAPP_WEB' ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-lg text-foreground">WhatsApp Web</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Conecte escaneando o QR Code. Ideal para números já existentes.
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Badge variant="outline" className="border-primary/20 text-foreground">
                          QR Code
                        </Badge>
                        <Badge variant="outline" className="border-primary/20 text-foreground">
                          Rápido
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Opção WhatsApp Cloud API */}
                <Card
                  className={`cursor-pointer border-2 transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${formData.provider === 'WHATSAPP_CLOUD_API'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/20 shadow-sm'
                    : 'border-muted hover:border-blue-600/50'
                    }`}
                  onClick={() => setFormData(prev => ({ ...prev, provider: 'WHATSAPP_CLOUD_API' }))}
                  role="radio"
                  aria-checked={formData.provider === 'WHATSAPP_CLOUD_API'}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setFormData(prev => ({ ...prev, provider: 'WHATSAPP_CLOUD_API' }))}
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center text-center space-y-4">
                      <div className={`p-4 rounded-full transition-colors ${formData.provider === 'WHATSAPP_CLOUD_API' ? 'bg-blue-100 dark:bg-blue-900' : 'bg-muted'}`}>
                        <Cloud className={`h-8 w-8 ${formData.provider === 'WHATSAPP_CLOUD_API' ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-lg text-foreground">WhatsApp Cloud API</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          API Oficial da Meta. Alta estabilidade e escala.
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Badge variant="outline" className="border-blue-200 text-foreground">
                          Oficial
                        </Badge>
                        <Badge variant="outline" className="border-blue-200 text-foreground">
                          Estável
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {currentStep === 'config' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Como você quer chamar este WhatsApp?</h3>
                <p className="text-muted-foreground">
                  Dê um nome para identificar facilmente este número
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Nome do WhatsApp *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: Vendas, Suporte, Atendimento..."
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


                {formData.provider === 'WHATSAPP_CLOUD_API' && (
                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="font-medium text-sm">Credenciais da Meta (Cloud API)</h4>

                    <div>
                      <Label htmlFor="cloudApiAccessToken">Access Token *</Label>
                      <Input
                        id="cloudApiAccessToken"
                        type="password"
                        value={formData.cloudApiAccessToken}
                        onChange={(e) => {
                          setFormData(prev => ({ ...prev, cloudApiAccessToken: e.target.value }));
                          setCloudApiValidation({ status: 'idle' });
                        }}
                        placeholder="EAAB..."
                        className="mt-1 font-mono"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Token de usuário do sistema ou temporário.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="cloudApiPhoneNumberId">Phone Number ID *</Label>
                        <Input
                          id="cloudApiPhoneNumberId"
                          value={formData.cloudApiPhoneNumberId}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, cloudApiPhoneNumberId: e.target.value }));
                            setCloudApiValidation({ status: 'idle' });
                          }}
                          placeholder="123456789..."
                          className="mt-1 font-mono"
                        />
                      </div>
                      <div>
                        <Label htmlFor="cloudApiWabaId">WABA ID *</Label>
                        <Input
                          id="cloudApiWabaId"
                          value={formData.cloudApiWabaId}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, cloudApiWabaId: e.target.value }));
                            setCloudApiValidation({ status: 'idle' });
                          }}
                          placeholder="987654321..."
                          className="mt-1 font-mono"
                        />
                      </div>
                    </div>

                    {/* Botão de Testar Credenciais */}
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleValidateCloudApi}
                        disabled={
                          cloudApiValidation.status === 'validating' ||
                          !formData.cloudApiAccessToken ||
                          !formData.cloudApiPhoneNumberId ||
                          !formData.cloudApiWabaId
                        }
                        className="flex items-center gap-2"
                      >
                        {cloudApiValidation.status === 'validating' ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Validando...
                          </>
                        ) : (
                          <>
                            <Shield className="h-4 w-4" />
                            Testar Credenciais
                          </>
                        )}
                      </Button>

                      {cloudApiValidation.status === 'valid' && (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="h-5 w-5" />
                          <span className="text-sm font-medium">Válido</span>
                        </div>
                      )}

                      {cloudApiValidation.status === 'invalid' && (
                        <div className="flex items-center gap-2 text-red-600">
                          <XCircle className="h-5 w-5" />
                          <span className="text-sm font-medium">Inválido</span>
                        </div>
                      )}
                    </div>

                    {/* Feedback visual de validação */}
                    {cloudApiValidation.status === 'valid' && cloudApiValidation.verifiedName && (
                      <Alert className="bg-green-50 border-green-200">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-700 text-sm">
                          <strong>Conexão verificada!</strong><br />
                          Nome: {cloudApiValidation.verifiedName}<br />
                          Telefone: {cloudApiValidation.phoneNumber}
                        </AlertDescription>
                      </Alert>
                    )}

                    {cloudApiValidation.status === 'invalid' && (
                      <Alert className="bg-red-50 border-red-200">
                        <XCircle className="h-4 w-4 text-red-600" />
                        <AlertDescription className="text-red-700 text-sm">
                          <strong>Falha na validação</strong><br />
                          {cloudApiValidation.error || 'Verifique as credenciais e tente novamente.'}
                        </AlertDescription>
                      </Alert>
                    )}

                    <Alert className="bg-blue-50 border-blue-200">
                      <Info className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-blue-700 text-xs">
                        Certifique-se de que o token tem permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
                      </AlertDescription>
                    </Alert>
                  </div>
                )}

              </div>
            </div>
          )}

          {currentStep === 'method' && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">Como deseja conectar?</h3>
                <p className="text-muted-foreground">
                  Instância <strong>{formData.name}</strong> criada com sucesso! Escolha como conectar o WhatsApp.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Opção QR Code */}
                <Card
                  className="cursor-pointer hover:border-primary transition-colors group"
                  onClick={handleSelectQRCode}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelectQRCode()}
                  aria-label="Conectar via QR Code"
                >
                  <CardContent className="p-6 text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                      <Smartphone className="h-8 w-8 text-primary" aria-hidden="true" />
                    </div>
                    <h4 className="font-semibold text-lg mb-2">Escanear QR Code</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Conecte agora escaneando o QR code com seu celular
                    </p>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" aria-hidden="true" />
                        <span>Conexão imediata</span>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" aria-hidden="true" />
                        <span>Você mesmo conecta</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Opção Link de Compartilhamento */}
                <Card
                  className="cursor-pointer hover:border-primary transition-colors group"
                  onClick={handleSelectShareLink}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelectShareLink()}
                  aria-label="Gerar link de compartilhamento"
                >
                  <CardContent className="p-6 text-center">
                    <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-500/20 transition-colors">
                      <Share2 className="h-8 w-8 text-blue-500" aria-hidden="true" />
                    </div>
                    <h4 className="font-semibold text-lg mb-2">Gerar Link</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Gere um link para outra pessoa conectar o WhatsApp
                    </p>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" aria-hidden="true" />
                        <span>Compartilhe via WhatsApp</span>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" aria-hidden="true" />
                        <span>Conexão remota</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {loading && (
                <div className="flex items-center justify-center py-4">
                  <Clock className="h-5 w-5 animate-spin mr-2 text-primary" aria-hidden="true" />
                  <span className="text-sm text-muted-foreground">Gerando link...</span>
                </div>
              )}
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
                <h3 className="text-lg font-semibold mb-2">WhatsApp Conectado!</h3>
                <p className="text-muted-foreground">
                  Seu WhatsApp está pronto para atender clientes
                </p>
              </div>

              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      {formData.provider === 'WHATSAPP_CLOUD_API' ? (
                        <Cloud className="h-5 w-5 text-green-600" />
                      ) : (
                        <Smartphone className="h-5 w-5 text-green-600" />
                      )}
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{formData.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {cloudApiValidation.phoneNumber || '+55 11 99999-9999'} • Conectado
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Informação sobre tipo de conexão */}
              {formData.provider === 'WHATSAPP_CLOUD_API' ? (
                <Alert className="bg-blue-50 border-blue-200 text-left">
                  <Cloud className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-700 text-sm">
                    <strong>WhatsApp Cloud API</strong><br />
                    API Oficial da Meta. Alta estabilidade e escala.
                  </AlertDescription>
                </Alert>
              ) : shareLink ? (
                /* Só mostra botões de compartilhamento para WhatsApp Web quando há link gerado */
                <div className="flex space-x-2 justify-center">
                  <Button
                    variant="outline"
                    onClick={() => window.open(shareLink, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir Link de Compartilhamento
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCopyLink}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar Link
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex justify-between pt-6 border-t">
          {currentStep !== 'channel' && currentStep !== 'success' && currentStep !== 'method' && (
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
              <Button onClick={handleClose}>
                Finalizar
              </Button>
            ) : currentStep === 'method' ? (
              <Button variant="ghost" onClick={handleClose}>
                Fechar e conectar depois
              </Button>
            ) : currentStep === 'config' ? (
              <Button
                onClick={handleSubmit}
                disabled={
                  !formData.name ||
                  loading ||
                  (formData.provider === 'WHATSAPP_CLOUD_API' && (!formData.cloudApiAccessToken || !formData.cloudApiPhoneNumberId || !formData.cloudApiWabaId))
                }
              >
                {loading ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    Criar Instância
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
    </Dialog >
  );
}