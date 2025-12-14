'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  MessageSquare,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Info,
  HelpCircle,
  Shield,
} from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/igniter.client';

// =============================================================================
// FORM SCHEMA
// =============================================================================
const chatwootFormSchema = z.object({
  enabled: z.boolean(),
  url: z.string().url('URL inválida').or(z.literal('')),
  accessToken: z.string().optional(),
  accountId: z.coerce.number().int().positive('Account ID inválido').or(z.literal(0)),
  inboxId: z.coerce.number().int().positive('Inbox ID inválido').or(z.literal(0)),
  ignoreGroups: z.boolean(),
  signMessages: z.boolean(),
  createNewConversation: z.boolean(),
  typingIndicator: z.boolean(),
  typingDelayMs: z.coerce.number().int().min(0).max(10000),
});

type ChatwootFormValues = z.infer<typeof chatwootFormSchema>;

// =============================================================================
// COMPONENT
// =============================================================================
export default function ChatwootConfigPage() {
  const { toast } = useToast();
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    inboxes?: Array<{ id: number; name: string }>;
  } | null>(null);

  // Get connections list
  const { data: instancesData, isLoading: loadingInstances } = api.instances.list.useQuery();
  const instances = (instancesData as any)?.data?.instances || [];
  const connectedInstances = instances.filter((i: any) => i.status === 'CONNECTED');

  // Form setup
  const form = useForm<ChatwootFormValues>({
    resolver: zodResolver(chatwootFormSchema),
    defaultValues: {
      enabled: false,
      url: '',
      accessToken: '',
      accountId: 0,
      inboxId: 0,
      ignoreGroups: false,
      signMessages: true,
      createNewConversation: false,
      typingIndicator: true,
      typingDelayMs: 1500,
    },
  });

  // Load config when connection is selected
  const loadConfig = useCallback(async () => {
    if (!selectedConnection) return;

    setIsLoadingConfig(true);
    setTestResult(null); // Reset test result on connection change

    try {
      const response = await fetch(`/api/v1/chatwoot/config/${selectedConnection}`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        const config = data.data || data;
        
        form.reset({
          enabled: config.chatwoot_enabled || false,
          url: config.chatwoot_url || '',
          accessToken: '', // Never pre-fill token for security
          accountId: config.chatwoot_account_id || 0,
          inboxId: config.chatwoot_inbox_id || 0,
          ignoreGroups: config.chatwoot_ignore_groups || false,
          signMessages: config.chatwoot_sign_messages ?? true,
          createNewConversation: config.chatwoot_create_new_conversation || false,
          typingIndicator: config.chatwoot_typing_indicator ?? true,
          typingDelayMs: config.chatwoot_typing_delay_ms || 1500,
        });

        setWebhookUrl(config.chatwoot_inbox_webhook_url || '');
      }
    } catch (error) {
      console.error('Error loading config:', error);
      toast({
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar a configuração.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingConfig(false);
    }
  }, [selectedConnection, form, toast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Test connection
  const handleTestConnection = async () => {
    const values = form.getValues();
    
    // WCAG 2.1: Clear validation feedback
    if (!values.url || !values.accessToken || !values.accountId) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha URL, Token e Account ID para testar',
        variant: 'destructive',
      });
      // Focus on first empty field for accessibility
      if (!values.url) form.setFocus('url');
      else if (!values.accessToken) form.setFocus('accessToken');
      else if (!values.accountId) form.setFocus('accountId');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(`/api/v1/chatwoot/test/${selectedConnection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          url: values.url,
          accessToken: values.accessToken,
          accountId: values.accountId,
          inboxId: values.inboxId || undefined,
        }),
      });

      const data = await response.json();
      const result = data.data || data;

      if (result.success) {
        setTestResult({
          success: true,
          message: result.message || 'Conexão estabelecida com sucesso!',
          inboxes: result.inboxes,
        });
        toast({
          title: 'Sucesso!',
          description: 'Conexão com Chatwoot estabelecida.',
        });
      } else {
        setTestResult({
          success: false,
          message: result.error || data.error || 'Falha ao conectar. Verifique suas credenciais.',
        });
        toast({
          title: 'Falha na conexão',
          description: result.error || data.error || 'Verifique suas credenciais',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || 'Erro de conexão. Verifique a URL e tente novamente.',
      });
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Save configuration
  const onSubmit = async (values: ChatwootFormValues) => {
    if (!selectedConnection) {
      toast({
        title: 'Selecione uma conexão',
        description: 'Escolha uma instância WhatsApp primeiro',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch(`/api/v1/chatwoot/config/${selectedConnection}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabled: values.enabled,
          url: values.url || undefined,
          accessToken: values.accessToken || undefined,
          accountId: values.accountId || undefined,
          inboxId: values.inboxId || undefined,
          ignoreGroups: values.ignoreGroups,
          signMessages: values.signMessages,
          createNewConversation: values.createNewConversation,
          typingIndicator: values.typingIndicator,
          typingDelayMs: values.typingDelayMs,
        }),
      });

      const data = await response.json();
      const result = data.data || data;

      if (response.ok) {
        setWebhookUrl(result.chatwoot_inbox_webhook_url || result.config?.chatwoot_inbox_webhook_url || '');
        toast({
          title: 'Salvo!',
          description: result.message || 'Configuração atualizada com sucesso.',
        });
      } else {
        throw new Error(result.error || data.error || 'Falha ao salvar');
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Copy webhook URL
  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: 'Copiado!',
      description: 'URL do webhook copiada para a área de transferência.',
    });
  };

  return (
    <>
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/ferramentas">Ferramentas</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Chatwoot</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col gap-6 p-4 pt-0 max-w-4xl">
        {/* Back button and title */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/ferramentas">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Chatwoot</h1>
              <p className="text-sm text-muted-foreground">
                Integração com atendimento centralizado
              </p>
            </div>
            <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600">
              Beta
            </Badge>
          </div>
        </div>

        {/* Beta Warning */}
        <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-600">Integração em Beta</AlertTitle>
          <AlertDescription>
            Esta integração está em fase de testes. Apenas mensagens novas são sincronizadas.
            Histórico anterior não será importado.
          </AlertDescription>
        </Alert>

        {/* =================================================================== */}
        {/* STEP 1: Connection Selector                                      */}
        {/* =================================================================== */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                1
              </div>
              <div>
                <CardTitle className="text-lg">Selecione a Conexão</CardTitle>
                <CardDescription>
                  Escolha qual instância WhatsApp será integrada com o Chatwoot
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingInstances ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <p className="text-sm text-muted-foreground">Carregando instâncias...</p>
              </div>
            ) : connectedInstances.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Nenhuma conexão ativa</AlertTitle>
                <AlertDescription>
                  Você precisa ter pelo menos uma instância WhatsApp conectada para configurar o Chatwoot.{' '}
                  <Link href="/integracoes" className="text-primary hover:underline">
                    Criar integração
                  </Link>
                </AlertDescription>
              </Alert>
            ) : (
              <Select 
                value={selectedConnection} 
                onValueChange={setSelectedConnection}
                aria-label="Selecione uma instância WhatsApp"
              >
                <SelectTrigger aria-describedby="connection-help">
                  <SelectValue placeholder="Selecione uma instância..." />
                </SelectTrigger>
                <SelectContent>
                  {connectedInstances.map((instance: any) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{instance.name}</span>
                        <span className="text-muted-foreground text-xs">
                          ({instance.phoneNumber || 'Sem número'})
                        </span>
                        <Badge variant="outline" className="text-green-600 text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Conectado
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p id="connection-help" className="text-xs text-muted-foreground">
              Apenas instâncias conectadas são exibidas. Cada instância pode ter uma configuração de Chatwoot independente.
            </p>
          </CardContent>
        </Card>

        {/* =================================================================== */}
        {/* CONFIGURATION FORM                                               */}
        {/* =================================================================== */}
        {selectedConnection && (
          <TooltipProvider>
            {isLoadingConfig ? (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <Skeleton className="h-6 w-48" />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <div className="grid grid-cols-2 gap-4">
                      <Skeleton className="h-10" />
                      <Skeleton className="h-10" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {/* ============================================================= */}
                  {/* STEP 2: Enable Toggle                                        */}
                  {/* ============================================================= */}
                  <Card className={form.watch('enabled') ? 'border-green-500/50 bg-green-500/5' : ''}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                            2
                          </div>
                          <div>
                            <CardTitle className="text-lg">Status da Integração</CardTitle>
                            <CardDescription>
                              Ative ou desative a sincronização com o Chatwoot
                            </CardDescription>
                          </div>
                        </div>
                        <FormField
                          control={form.control}
                          name="enabled"
                          render={({ field }) => (
                            <FormItem className="flex items-center gap-2">
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  aria-label="Ativar integração Chatwoot"
                                />
                              </FormControl>
                              <FormLabel className="!mt-0 font-medium">
                                {field.value ? (
                                  <span className="text-green-600 flex items-center gap-1">
                                    <CheckCircle2 className="h-4 w-4" /> Ativo
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">Inativo</span>
                                )}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardHeader>
                  </Card>

                  {/* ============================================================= */}
                  {/* STEP 3: Credentials Card                                     */}
                  {/* ============================================================= */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                          3
                        </div>
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            Credenciais do Chatwoot
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>Você encontra essas informações no painel do Chatwoot em Profile Settings → Access Token e nas configurações da sua conta.</p>
                              </TooltipContent>
                            </Tooltip>
                          </CardTitle>
                          <CardDescription>
                            Insira as credenciais da sua instância Chatwoot.{' '}
                            <a
                              href="https://www.chatwoot.com/docs/product/others/configure-api"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              Ver documentação
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="url"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-1">
                              URL do Chatwoot
                              <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="https://app.chatwoot.com" 
                                aria-required="true"
                                aria-describedby="url-description"
                                {...field} 
                              />
                            </FormControl>
                            <FormDescription id="url-description">
                              URL base da sua instância (sem barra no final)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="accessToken"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              Token de Acesso
                              <span className="text-destructive">*</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Shield className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Seu token é armazenado de forma segura e nunca é exposto.</p>
                                </TooltipContent>
                              </Tooltip>
                            </FormLabel>
                            <FormControl>
                              <Input 
                                type="password"
                                placeholder="Cole seu Access Token aqui" 
                                aria-required="true"
                                aria-describedby="token-description"
                                autoComplete="new-password"
                                {...field} 
                              />
                            </FormControl>
                            <FormDescription id="token-description">
                              Encontre em Profile Settings → Access Token
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="accountId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-1">
                                Account ID
                                <span className="text-destructive">*</span>
                              </FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  placeholder="1" 
                                  aria-required="true"
                                  min={1}
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Número na URL após /accounts/
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="inboxId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2">
                                Inbox ID
                                <span className="text-destructive">*</span>
                                {testResult?.inboxes && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="h-3.5 w-3.5 text-primary cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Use o teste de conexão para ver as inboxes disponíveis</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  placeholder="5" 
                                  aria-required="true"
                                  min={1}
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                ID da inbox do WhatsApp
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Test Connection Button */}
                      <div className="pt-2 flex items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleTestConnection}
                          disabled={isTesting || form.formState.isSubmitting}
                          aria-describedby="test-help"
                        >
                          {isTesting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          {isTesting ? 'Testando...' : 'Testar Conexão'}
                        </Button>
                        <p id="test-help" className="text-xs text-muted-foreground">
                          Valide suas credenciais antes de salvar
                        </p>
                      </div>

                      {/* Test Result - WCAG: Live region for dynamic content */}
                      <div aria-live="polite" aria-atomic="true">
                        {testResult && (
                          <Alert 
                            variant={testResult.success ? 'default' : 'destructive'}
                            className={testResult.success ? 'border-green-500/50 bg-green-500/10' : ''}
                          >
                            {testResult.success ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4" />
                            )}
                            <AlertTitle>
                              {testResult.success ? '✓ Conexão estabelecida!' : 'Falha na Conexão'}
                            </AlertTitle>
                            <AlertDescription>
                              {testResult.message}
                              {testResult.inboxes && testResult.inboxes.length > 0 && (
                                <div className="mt-3 p-3 bg-background rounded-md border">
                                  <p className="text-sm font-medium mb-2">Inboxes disponíveis:</p>
                                  <ul className="space-y-1">
                                    {testResult.inboxes.map(inbox => (
                                      <li 
                                        key={inbox.id}
                                        className="text-sm flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                                        onClick={() => form.setValue('inboxId', inbox.id)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            form.setValue('inboxId', inbox.id);
                                          }
                                        }}
                                      >
                                        <span>{inbox.name}</span>
                                        <Badge variant="outline">ID: {inbox.id}</Badge>
                                      </li>
                                    ))}
                                  </ul>
                                  <p className="text-xs text-muted-foreground mt-2">
                                    Clique para selecionar uma inbox
                                  </p>
                                </div>
                              )}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* ============================================================= */}
                  {/* STEP 4: Options Card                                         */}
                  {/* ============================================================= */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                          4
                        </div>
                        <div>
                          <CardTitle className="text-lg">Opções Avançadas</CardTitle>
                          <CardDescription>
                            Configure o comportamento da integração
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4">
                        <FormField
                          control={form.control}
                          name="ignoreGroups"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                              <div className="space-y-0.5 pr-4">
                                <FormLabel className="cursor-pointer">Ignorar Grupos</FormLabel>
                                <FormDescription>
                                  Não sincronizar mensagens de grupos WhatsApp
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  aria-label="Ignorar mensagens de grupos"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="signMessages"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                              <div className="space-y-0.5 pr-4">
                                <FormLabel className="cursor-pointer">Assinar Mensagens</FormLabel>
                                <FormDescription>
                                  Incluir <code className="bg-muted px-1 rounded">*Nome do Agente:*</code> no início
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  aria-label="Assinar mensagens com nome do agente"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="typingIndicator"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                              <div className="space-y-0.5 pr-4">
                                <FormLabel className="cursor-pointer">Indicador de Digitação</FormLabel>
                                <FormDescription>
                                  Mostrar "digitando..." antes de enviar mensagens
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  aria-label="Mostrar indicador de digitação"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        {form.watch('typingIndicator') && (
                          <FormField
                            control={form.control}
                            name="typingDelayMs"
                            render={({ field }) => (
                              <FormItem className="ml-4 pl-4 border-l-2 border-primary/30">
                                <FormLabel>Tempo de Digitação</FormLabel>
                                <div className="flex items-center gap-4">
                                  <FormControl>
                                    <Input 
                                      type="range"
                                      min={0}
                                      max={5000}
                                      step={250}
                                      className="w-48"
                                      aria-valuemin={0}
                                      aria-valuemax={5000}
                                      aria-valuenow={field.value}
                                      {...field} 
                                    />
                                  </FormControl>
                                  <span className="text-sm font-mono bg-muted px-2 py-1 rounded min-w-[60px] text-center">
                                    {field.value}ms
                                  </span>
                                </div>
                                <FormDescription>
                                  Tempo de espera antes de enviar ({(field.value / 1000).toFixed(1)}s)
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        <FormField
                          control={form.control}
                          name="createNewConversation"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                              <div className="space-y-0.5 pr-4">
                                <FormLabel className="cursor-pointer flex items-center gap-2">
                                  Sempre Criar Nova Conversa
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <p>Por padrão, mensagens são adicionadas a uma conversa existente. Ative para criar uma nova conversa a cada contato.</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </FormLabel>
                                <FormDescription>
                                  Criar nova conversa ao invés de reutilizar existentes
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  aria-label="Sempre criar nova conversa"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* ============================================================= */}
                  {/* STEP 5: Webhook URL Card                                     */}
                  {/* ============================================================= */}
                  {webhookUrl && (
                    <Card className="border-primary/50 bg-primary/5">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                            5
                          </div>
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              URL do Webhook
                              <Badge variant="secondary">Importante</Badge>
                            </CardTitle>
                            <CardDescription>
                              Configure esta URL nas configurações da inbox do Chatwoot
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Input 
                            value={webhookUrl} 
                            readOnly 
                            className="font-mono text-sm bg-background"
                            aria-label="URL do webhook para configurar no Chatwoot"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={copyWebhookUrl}
                            aria-label={copied ? "URL copiada" : "Copiar URL do webhook"}
                          >
                            {copied ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        
                        <Alert className="bg-background">
                          <Info className="h-4 w-4" />
                          <AlertTitle className="text-sm">Como configurar no Chatwoot:</AlertTitle>
                          <AlertDescription className="text-sm">
                            <ol className="list-decimal list-inside space-y-1 mt-2">
                              <li>Acesse seu painel Chatwoot</li>
                              <li>Vá em <strong>Settings → Inboxes</strong></li>
                              <li>Selecione sua inbox de WhatsApp</li>
                              <li>Na aba <strong>Configurações</strong>, cole a URL acima em <strong>Webhook URL</strong></li>
                              <li>Salve as alterações</li>
                            </ol>
                          </AlertDescription>
                        </Alert>
                      </CardContent>
                    </Card>
                  )}

                  {/* ============================================================= */}
                  {/* SUBMIT BUTTONS                                               */}
                  {/* ============================================================= */}
                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t">
                    <Button 
                      type="button" 
                      variant="outline" 
                      asChild
                      className="w-full sm:w-auto"
                    >
                      <Link href="/ferramentas">Cancelar</Link>
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={form.formState.isSubmitting}
                      className="w-full sm:w-auto"
                    >
                      {form.formState.isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Salvar Configuração
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </TooltipProvider>
        )}
      </div>
    </>
  );
}
