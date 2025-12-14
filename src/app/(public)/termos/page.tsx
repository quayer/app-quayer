import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, FileText, Calendar, Building2, Mail, Scale, Shield, AlertTriangle, Ban, CreditCard, XCircle, RefreshCw, Lock, Globe, Gavel } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export const metadata: Metadata = {
  title: 'Termos de Servico | Quayer',
  description: 'Termos e Condicoes de Uso da plataforma Quayer',
}

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Quayer" width={100} height={24} />
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto max-w-4xl py-12 px-4">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">Termos e Condicoes de Uso</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Leia atentamente os termos que regem o uso da plataforma Quayer
          </p>
        </div>

        {/* Meta Info */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Ultima atualizacao</p>
                  <p className="font-medium">12 de Dezembro de 2024</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Razao Social</p>
                  <p className="font-medium">Quayer Tecnologia LTDA</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Contato</p>
                  <p className="font-medium">contato@quayer.com</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table of Contents */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <h2 className="font-semibold mb-4">Indice</h2>
            <nav className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {[
                { id: 'definicoes', label: '1. Definicoes' },
                { id: 'objeto', label: '2. Objeto' },
                { id: 'cadastro', label: '3. Cadastro e Acesso' },
                { id: 'obrigacoes-usuario', label: '4. Obrigacoes do Usuario' },
                { id: 'obrigacoes-quayer', label: '5. Obrigacoes da Quayer' },
                { id: 'uso-permitido', label: '6. Uso Permitido' },
                { id: 'uso-proibido', label: '7. Uso Proibido' },
                { id: 'pagamento', label: '8. Pagamento e Assinatura' },
                { id: 'cancelamento', label: '9. Cancelamento' },
                { id: 'propriedade', label: '10. Propriedade Intelectual' },
                { id: 'privacidade', label: '11. Privacidade e Dados' },
                { id: 'responsabilidades', label: '12. Limitacao de Responsabilidade' },
                { id: 'alteracoes', label: '13. Alteracoes dos Termos' },
                { id: 'contato', label: '14. Contato' },
              ].map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </CardContent>
        </Card>

        {/* Terms Content */}
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          {/* Section 1 */}
          <section id="definicoes" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Scale className="h-5 w-5 text-blue-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">1. Definicoes</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p><strong>Quayer:</strong> Plataforma de comunicacao omnichannel que permite a centralizacao e gestao de conversas via WhatsApp e outros canais.</p>
                <p><strong>Usuario:</strong> Pessoa fisica ou juridica que utiliza os servicos da Quayer.</p>
                <p><strong>Organizacao:</strong> Empresa ou entidade que contrata os servicos da Quayer para uso por seus colaboradores.</p>
                <p><strong>Instancia:</strong> Conexao individual do WhatsApp vinculada a conta do usuario.</p>
                <p><strong>Plataforma:</strong> Sistema web e APIs disponibilizados pela Quayer.</p>
                <p><strong>Dados Pessoais:</strong> Informacoes relacionadas a pessoa natural identificada ou identificavel, conforme definido pela LGPD.</p>
              </CardContent>
            </Card>
          </section>

          {/* Section 2 */}
          <section id="objeto" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-green-500/10">
                <FileText className="h-5 w-5 text-green-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">2. Objeto</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>Estes Termos de Uso regulam a utilizacao da plataforma Quayer, que oferece:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Integracao com WhatsApp para envio e recebimento de mensagens</li>
                  <li>Gestao centralizada de conversas e atendimentos</li>
                  <li>Automacao de respostas via inteligencia artificial</li>
                  <li>Ferramentas de colaboracao em equipe</li>
                  <li>Relatorios e analiticos de atendimento</li>
                  <li>APIs para integracao com sistemas externos</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Section 3 */}
          <section id="cadastro" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Shield className="h-5 w-5 text-purple-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">3. Cadastro e Acesso</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p><strong>3.1.</strong> Para utilizar a Quayer, o usuario deve criar uma conta fornecendo informacoes verdadeiras e atualizadas.</p>
                <p><strong>3.2.</strong> O usuario e responsavel pela seguranca de suas credenciais de acesso (email, senha, tokens de API).</p>
                <p><strong>3.3.</strong> E proibido compartilhar credenciais de acesso com terceiros nao autorizados.</p>
                <p><strong>3.4.</strong> A Quayer reserva-se o direito de suspender ou encerrar contas que violem estes termos.</p>
                <p><strong>3.5.</strong> O usuario deve ter no minimo 18 anos ou ser representado por responsavel legal.</p>
              </CardContent>
            </Card>
          </section>

          {/* Section 4 */}
          <section id="obrigacoes-usuario" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">4. Obrigacoes do Usuario</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>O usuario compromete-se a:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Utilizar a plataforma em conformidade com a legislacao brasileira vigente</li>
                  <li>Respeitar os Termos de Servico do WhatsApp e outras plataformas integradas</li>
                  <li>Nao utilizar a plataforma para envio de SPAM ou mensagens nao solicitadas</li>
                  <li>Obter consentimento previo dos destinatarios antes de enviar mensagens</li>
                  <li>Manter seus dados cadastrais atualizados</li>
                  <li>Notificar imediatamente a Quayer sobre qualquer uso nao autorizado de sua conta</li>
                  <li>Nao tentar acessar sistemas, dados ou redes da Quayer sem autorizacao</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Section 5 */}
          <section id="obrigacoes-quayer" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <Building2 className="h-5 w-5 text-cyan-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">5. Obrigacoes da Quayer</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>A Quayer compromete-se a:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Disponibilizar a plataforma com nivel de servico adequado (SLA)</li>
                  <li>Proteger os dados dos usuarios conforme a LGPD</li>
                  <li>Manter medidas de seguranca tecnica e administrativa</li>
                  <li>Comunicar alteracoes significativas nos termos ou servicos</li>
                  <li>Fornecer suporte tecnico conforme o plano contratado</li>
                  <li>Nao comercializar dados pessoais dos usuarios</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Section 6 */}
          <section id="uso-permitido" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Shield className="h-5 w-5 text-green-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">6. Uso Permitido</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>A plataforma Quayer pode ser utilizada para:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Atendimento ao cliente e suporte</li>
                  <li>Vendas e relacionamento comercial</li>
                  <li>Notificacoes transacionais (confirmacoes, atualizacoes de pedidos)</li>
                  <li>Comunicacao interna de equipes</li>
                  <li>Automacao de processos de atendimento</li>
                  <li>Integracao com sistemas CRM, ERP e outros</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Section 7 */}
          <section id="uso-proibido" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Ban className="h-5 w-5 text-red-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">7. Uso Proibido</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>E expressamente proibido utilizar a Quayer para:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Envio de SPAM, mensagens em massa nao solicitadas ou phishing</li>
                  <li>Difusao de conteudo ilegal, difamatorio, discriminatorio ou que incite violencia</li>
                  <li>Fraudes, golpes ou qualquer atividade ilicita</li>
                  <li>Violacao de direitos autorais ou propriedade intelectual</li>
                  <li>Coleta nao autorizada de dados pessoais de terceiros</li>
                  <li>Tentativas de acesso nao autorizado a sistemas ou dados</li>
                  <li>Uso de bots ou automacoes que violem os termos do WhatsApp</li>
                  <li>Revenda ou sublicenciamento dos servicos sem autorizacao</li>
                </ul>
                <p className="text-red-600 dark:text-red-400 font-medium mt-4">
                  A violacao destas regras pode resultar em suspensao imediata da conta e responsabilizacao civil e criminal.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Section 8 */}
          <section id="pagamento" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CreditCard className="h-5 w-5 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">8. Pagamento e Assinatura</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p><strong>8.1.</strong> Os planos e precos estao disponiveis no site da Quayer e podem ser alterados com aviso previo.</p>
                <p><strong>8.2.</strong> O pagamento e processado por parceiros de pagamento (Stripe, Hotmart ou similares).</p>
                <p><strong>8.3.</strong> A assinatura e renovada automaticamente no periodo contratado (mensal ou anual).</p>
                <p><strong>8.4.</strong> O nao pagamento pode resultar em suspensao do acesso aos servicos.</p>
                <p><strong>8.5.</strong> Reembolsos seguem a politica vigente e a legislacao do consumidor.</p>
              </CardContent>
            </Card>
          </section>

          {/* Section 9 */}
          <section id="cancelamento" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-gray-500/10">
                <XCircle className="h-5 w-5 text-gray-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">9. Cancelamento</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p><strong>9.1.</strong> O usuario pode cancelar sua assinatura a qualquer momento pelo painel de configuracoes.</p>
                <p><strong>9.2.</strong> O acesso permanece ativo ate o final do periodo ja pago.</p>
                <p><strong>9.3.</strong> Apos o cancelamento, os dados serao mantidos por 30 dias para possivel reativacao.</p>
                <p><strong>9.4.</strong> A exclusao definitiva dos dados pode ser solicitada a qualquer momento.</p>
                <p><strong>9.5.</strong> A Quayer pode encerrar contas que violem estes termos sem aviso previo.</p>
              </CardContent>
            </Card>
          </section>

          {/* Section 10 */}
          <section id="propriedade" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-violet-500/10">
                <Lock className="h-5 w-5 text-violet-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">10. Propriedade Intelectual</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p><strong>10.1.</strong> A marca Quayer, logotipos, interfaces e codigo-fonte sao propriedade exclusiva da Quayer.</p>
                <p><strong>10.2.</strong> O usuario mantem a propriedade sobre seus dados e conteudos inseridos na plataforma.</p>
                <p><strong>10.3.</strong> E proibida a copia, modificacao ou distribuicao de qualquer parte da plataforma sem autorizacao.</p>
                <p><strong>10.4.</strong> O usuario concede a Quayer licenca para processar seus dados conforme necessario para prestacao dos servicos.</p>
              </CardContent>
            </Card>
          </section>

          {/* Section 11 */}
          <section id="privacidade" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Shield className="h-5 w-5 text-blue-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">11. Privacidade e Dados</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p><strong>11.1.</strong> O tratamento de dados pessoais segue nossa <Link href="/privacidade" className="text-primary hover:underline">Politica de Privacidade</Link>.</p>
                <p><strong>11.2.</strong> A Quayer atua como operadora de dados em nome do usuario (controlador).</p>
                <p><strong>11.3.</strong> O usuario e responsavel pelo tratamento adequado dos dados de seus clientes.</p>
                <p><strong>11.4.</strong> A Quayer nao acessa o conteudo das conversas, exceto quando necessario para suporte tecnico autorizado.</p>
              </CardContent>
            </Card>
          </section>

          {/* Section 12 */}
          <section id="responsabilidades" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">12. Limitacao de Responsabilidade</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p><strong>12.1.</strong> A Quayer nao se responsabiliza por:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Indisponibilidade do WhatsApp ou outras plataformas de terceiros</li>
                  <li>Bloqueio de numeros pelo WhatsApp por violacao de suas politicas</li>
                  <li>Perda de dados causada por uso inadequado ou forca maior</li>
                  <li>Danos indiretos, lucros cessantes ou perdas consequenciais</li>
                  <li>Conteudo enviado pelos usuarios atraves da plataforma</li>
                </ul>
                <p><strong>12.2.</strong> A responsabilidade total da Quayer e limitada ao valor pago pelo usuario nos ultimos 12 meses.</p>
              </CardContent>
            </Card>
          </section>

          {/* Section 13 */}
          <section id="alteracoes" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-teal-500/10">
                <RefreshCw className="h-5 w-5 text-teal-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">13. Alteracoes dos Termos</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p><strong>13.1.</strong> Estes termos podem ser alterados a qualquer momento.</p>
                <p><strong>13.2.</strong> Alteracoes significativas serao comunicadas por email ou notificacao na plataforma.</p>
                <p><strong>13.3.</strong> O uso continuado apos alteracoes implica aceitacao dos novos termos.</p>
                <p><strong>13.4.</strong> Versoes anteriores ficam disponiveis mediante solicitacao.</p>
              </CardContent>
            </Card>
          </section>

          {/* Section 14 */}
          <section id="contato" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-indigo-500/10">
                <Mail className="h-5 w-5 text-indigo-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">14. Contato</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>Para duvidas, sugestoes ou solicitacoes relacionadas a estes termos:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">contato@quayer.com</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Site</p>
                      <p className="font-medium">quayer.com</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Jurisdiction */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-slate-500/10">
                <Gavel className="h-5 w-5 text-slate-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">Foro</h2>
            </div>
            <Card>
              <CardContent className="p-6">
                <p>Fica eleito o foro da comarca de Sao Paulo/SP para dirimir quaisquer controversias oriundas destes termos, com renuncia expressa a qualquer outro, por mais privilegiado que seja.</p>
              </CardContent>
            </Card>
          </section>
        </div>

        <Separator className="my-12" />

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>Documento atualizado em 12 de Dezembro de 2024</p>
          <p className="mt-2">
            <Link href="/privacidade" className="text-primary hover:underline">
              Ver Politica de Privacidade
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
