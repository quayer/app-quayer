'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Smartphone, 
  MessageSquare, 
  Clock, 
  RefreshCw, 
  Info,
  CheckCircle,
  Copy,
  Share2,
  QrCode,
  Wifi,
  WifiOff
} from 'lucide-react';
import { toast } from 'sonner';

interface SharePageProps {
  token: string;
}

interface InstanceData {
  id: string;
  name: string;
  status: 'connecting' | 'connected' | 'disconnected';
  phoneNumber?: string;
  profileName?: string;
  qrCode?: string;
  expiresAt: Date;
  organizationName: string;
}

function SharePageContent({ token }: SharePageProps) {
  const [instance, setInstance] = useState<InstanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'waiting' | 'connecting' | 'connected' | 'expired'>('waiting');

  // Buscar dados da instância via API real
  useEffect(() => {
    const fetchInstanceData = async () => {
      try {
        setLoading(true);
        
        // Chamada real para API de compartilhamento
        const response = await fetch(`/api/v1/instances/share/${token}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            setConnectionStatus('expired');
            return;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success && result.data) {
          const instanceData: InstanceData = {
            id: result.data.id,
            name: result.data.name,
            status: result.data.status || 'connecting',
            phoneNumber: result.data.phoneNumber,
            profileName: result.data.profileName || result.data.name,
            qrCode: result.data.qrCode,
            expiresAt: new Date(result.data.expiresAt),
            organizationName: result.data.organizationName || 'Organização'
          };
          
          setInstance(instanceData);
          setTimeLeft(Math.max(0, Math.floor((instanceData.expiresAt.getTime() - Date.now()) / 1000)));
          setConnectionStatus(result.data.status === 'connected' ? 'connected' : 'waiting');
        } else {
          throw new Error(result.message || 'Erro ao carregar dados da instância');
        }
      } catch (error) {
        console.error('Erro ao carregar instância:', error);
        setConnectionStatus('expired');
      } finally {
        setLoading(false);
      }
    };

    fetchInstanceData();
  }, [token]);

  // Timer para expiração
  useEffect(() => {
    if (timeLeft <= 0) {
      setConnectionStatus('expired');
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setConnectionStatus('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${secs}s`;
  };

  const handleRefreshQR = async () => {
    try {
      toast.info('Gerando novo QR Code...');
      setLoading(true);
      
      // Chamada real para API de reconexão
      const response = await fetch(`/api/v1/instances/share/${token}/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        setInstance(prev => prev ? { 
          ...prev, 
          qrCode: result.data.qrCode,
          expiresAt: new Date(result.data.expiresAt)
        } : null);
        
        setTimeLeft(Math.floor((new Date(result.data.expiresAt).getTime() - Date.now()) / 1000));
        setConnectionStatus('waiting');
        toast.success('Novo QR Code gerado!');
      } else {
        throw new Error(result.message || 'Erro ao gerar novo QR Code');
      }
    } catch (error) {
      console.error('Erro ao gerar novo QR Code:', error);
      toast.error('Erro ao gerar novo QR Code. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copiado para a área de transferência!');
    } catch (error) {
      toast.error('Erro ao copiar link');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Conectar WhatsApp - ${instance?.name}`,
          text: `Conecte sua conta WhatsApp à ${instance?.organizationName}`,
          url: window.location.href
        });
      } catch (error) {
        console.log('Erro ao compartilhar:', error);
      }
    } else {
      handleCopyLink();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-green-600" />
          <p className="text-muted-foreground">Carregando conexão...</p>
        </div>
      </div>
    );
  }

  if (!instance || connectionStatus === 'expired') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-xl font-semibold mb-2">Link Expirado</h1>
            <p className="text-muted-foreground mb-6">
              Este link de conexão expirou. Solicite um novo link ao seu administrador.
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar Novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Smartphone className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Conecte seu WhatsApp</h1>
                <p className="text-sm text-muted-foreground">{instance.organizationName}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handleCopyLink}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar Link
              </Button>
              <Button variant="outline" size="sm" onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" />
                Compartilhar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Title Section */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">
              Conecte seu WhatsApp à <span className="text-green-600">{instance.organizationName}</span>
            </h2>
            <p className="text-lg text-muted-foreground">
              Gerencie suas conversas de WhatsApp com facilidade e eficiência
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* QR Code Section */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <QrCode className="h-5 w-5 text-green-600" />
                    <span>QR Code de Conexão</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="bg-white p-6 rounded-lg border-2 border-green-200 inline-block mb-4">
                    <div className="w-48 h-48 bg-black rounded-lg flex items-center justify-center">
                      <span className="text-white text-sm">QR Code</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center space-x-2 mb-4">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm font-medium">
                      Expira em: {formatTime(timeLeft)}
                    </span>
                  </div>

                  <Button 
                    onClick={handleRefreshQR} 
                    disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Gerar novo QR Code
                  </Button>
                </CardContent>
              </Card>

              {/* Status Card */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
                    <div>
                      <p className="font-medium">Aguardando conexão...</p>
                      <p className="text-sm text-muted-foreground">
                        Escaneie o QR code com seu WhatsApp
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Instructions Section */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Instruções para conexão</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-medium">1</span>
                      <div>
                        <p className="font-medium">Abra o WhatsApp no seu celular</p>
                        <p className="text-sm text-muted-foreground">
                          Certifique-se de usar a versão mais recente do aplicativo
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-medium">2</span>
                      <div>
                        <p className="font-medium">Acesse as configurações</p>
                        <div className="flex items-center space-x-4 mt-1">
                          <div className="flex items-center space-x-1">
                            <span className="text-xs">Android:</span>
                            <span className="text-xs font-mono">⋮</span>
                            <span className="text-xs">Mais opções</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <span className="text-xs">iPhone:</span>
                            <span className="text-xs font-mono">⚙️</span>
                            <span className="text-xs">Configurações</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-medium">3</span>
                      <div>
                        <p className="font-medium">Acesse dispositivos conectados</p>
                        <p className="text-sm text-muted-foreground">
                          Toque em "Dispositivos conectados" e depois em "Conectar dispositivo"
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-medium">4</span>
                      <div>
                        <p className="font-medium">Escaneie o QR Code</p>
                        <p className="text-sm text-muted-foreground">
                          Aponte a câmera do celular para o QR Code exibido nesta tela
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Help Section */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start space-x-3">
                    <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium mb-2">Está com dúvidas?</p>
                      <p className="text-sm text-muted-foreground mb-3">
                        Se ocorrer algum erro ao escanear o QR code, aguarde 45 segundos ou clique para gerar um novo código.
                      </p>
                      <Button variant="link" className="p-0 h-auto text-blue-600">
                        Assista nosso tutorial de ativação →
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Important Note */}
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  <strong>A duração deste link de acesso é de no máximo 1 hora.</strong> Após isso, será necessário pedir outro link para seu Administrador.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string>('');

  useEffect(() => {
    params.then(({ token }) => setToken(token));
  }, [params]);

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-green-600" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return <SharePageContent token={token} />;
}