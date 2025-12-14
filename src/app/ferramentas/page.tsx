'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Wrench,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Webhook,
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Tool cards data
const tools = [
  {
    id: 'webhooks',
    name: 'Webhooks',
    description: 'Configure webhooks para receber eventos da sua instância em tempo real.',
    icon: Webhook,
    href: '/ferramentas/webhooks',
    status: 'active' as const,
    features: [
      'Eventos em tempo real',
      'Configuração por instância',
      'Logs de entrega',
      'Debug e reenvio',
    ],
    docUrl: null,
  },
  {
    id: 'chatwoot',
    name: 'Chatwoot',
    description: 'Integre com o Chatwoot para atendimento centralizado. Sincronize conversas do WhatsApp automaticamente.',
    icon: MessageSquare,
    href: '/ferramentas/chatwoot',
    status: 'beta' as const,
    features: [
      'Sincronização bidirecional',
      'Múltiplos agentes',
      'Histórico unificado',
      'Typing automático',
    ],
    docUrl: 'https://www.chatwoot.com/docs',
  },
  // Future tools can be added here
];

type ToolStatus = 'active' | 'inactive' | 'beta' | 'coming_soon';

function getStatusBadge(status: ToolStatus) {
  switch (status) {
    case 'active':
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Ativo
        </Badge>
      );
    case 'beta':
      return (
        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
          <AlertCircle className="w-3 h-3 mr-1" />
          Beta
        </Badge>
      );
    case 'coming_soon':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <Clock className="w-3 h-3 mr-1" />
          Em breve
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <AlertCircle className="w-3 h-3 mr-1" />
          Inativo
        </Badge>
      );
  }
}

export default function FerramentasPage() {
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
                <BreadcrumbPage>Ferramentas</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
        {/* Page Title */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wrench className="h-6 w-6" />
            Ferramentas
          </h1>
          <p className="text-muted-foreground">
            Integre ferramentas externas para expandir as capacidades da sua operação.
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Card
                key={tool.id}
                className="group relative overflow-hidden hover:shadow-lg transition-all duration-200 hover:border-primary/50"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{tool.name}</CardTitle>
                        {getStatusBadge(tool.status)}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CardDescription className="text-sm">
                    {tool.description}
                  </CardDescription>

                  {/* Features */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Recursos
                    </p>
                    <ul className="grid grid-cols-2 gap-1.5">
                      {tool.features.map((feature, i) => (
                        <li
                          key={i}
                          className="text-xs text-muted-foreground flex items-center gap-1"
                        >
                          <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    <Button asChild className="flex-1">
                      <Link href={tool.href}>
                        Configurar
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    {tool.docUrl && (
                      <Button variant="outline" size="icon" asChild>
                        <a href={tool.docUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Coming Soon Card */}
          <Card className="border-dashed opacity-60">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Wrench className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-lg text-muted-foreground">
                    Mais ferramentas
                  </CardTitle>
                  {getStatusBadge('coming_soon')}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Estamos trabalhando em novas integrações. Fique atento para atualizações!
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
