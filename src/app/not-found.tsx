import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Home,
  MessageCircle,
  Settings,
  Users,
  ArrowLeft,
  Search,
  HelpCircle,
  FileQuestion
} from 'lucide-react'

const quickLinks = [
  { href: '/integracoes', icon: MessageCircle, label: 'Canais de Comunicacao', description: 'Gerencie suas conexoes WhatsApp' },
  { href: '/contatos', icon: Users, label: 'Contatos', description: 'Veja e gerencie seus contatos' },
  { href: '/configuracoes/departamentos', icon: Settings, label: 'Configuracoes', description: 'Ajuste as configuracoes do sistema' },
]

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Error Illustration */}
        <div className="text-center mb-8">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
            <div className="relative">
              <FileQuestion className="h-24 w-24 mx-auto text-primary/80 mb-4" strokeWidth={1.5} />
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-7xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              404
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold mb-3">
            Pagina nao encontrada
          </h1>

          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            A pagina que voce esta procurando nao existe, foi movida ou voce nao tem permissao para acessa-la.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
          <Button asChild size="lg" className="w-full sm:w-auto gap-2">
            <Link href="/">
              <Home className="h-4 w-4" />
              Ir para o Inicio
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto gap-2">
            <Link href="javascript:history.back()">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </Button>
        </div>

        {/* Quick Links */}
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            <span>Ou navegue para uma dessas paginas:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {quickLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <Card className="h-full hover:bg-muted/50 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-4 text-center">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/20 transition-colors">
                      <link.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-medium text-sm mb-1">{link.label}</h3>
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-10 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-full px-4 py-2">
            <HelpCircle className="h-4 w-4" />
            <span>Precisa de ajuda?</span>
            <Link href="mailto:suporte@quayer.com" className="text-primary hover:underline font-medium">
              Entre em contato
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
