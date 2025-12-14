import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft,
  Shield,
  Calendar,
  Building2,
  Mail,
  Database,
  Eye,
  Users,
  Lock,
  UserCheck,
  Globe,
  Clock,
  AlertTriangle,
  Edit,
  Server,
  CheckCircle,
  Trash2,
  Download,
  FileText
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export const metadata: Metadata = {
  title: 'Politica de Privacidade | Quayer',
  description: 'Politica de Privacidade e Protecao de Dados da plataforma Quayer - LGPD',
}

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2" aria-label="Ir para pagina inicial">
            <Image src="/logo.svg" alt="Quayer" width={100} height={24} />
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login" className="gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
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
            <Shield className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">Politica de Privacidade</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Transparencia e seguranca no tratamento dos seus dados pessoais conforme a LGPD
          </p>
        </div>

        {/* Meta Info */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="text-muted-foreground">Ultima atualizacao</p>
                  <p className="font-medium">12 de Dezembro de 2024</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="text-muted-foreground">Razao Social</p>
                  <p className="font-medium">Quayer Tecnologia LTDA</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="text-muted-foreground">DPO</p>
                  <p className="font-medium">dpo@quayer.com</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table of Contents */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <h2 className="font-semibold mb-4">Indice</h2>
            <nav className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm" aria-label="Indice da politica de privacidade">
              {[
                { id: 'introducao', label: '1. Introducao' },
                { id: 'dados-coletados', label: '2. Dados Coletados' },
                { id: 'finalidade', label: '3. Finalidade do Tratamento' },
                { id: 'base-legal', label: '4. Base Legal' },
                { id: 'compartilhamento', label: '5. Compartilhamento de Dados' },
                { id: 'armazenamento', label: '6. Armazenamento' },
                { id: 'seguranca', label: '7. Medidas de Seguranca' },
                { id: 'direitos', label: '8. Seus Direitos (LGPD)' },
                { id: 'cookies', label: '9. Cookies' },
                { id: 'retencao', label: '10. Retencao de Dados' },
                { id: 'menores', label: '11. Menores de Idade' },
                { id: 'alteracoes', label: '12. Alteracoes' },
                { id: 'contato', label: '13. Contato e DPO' },
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

        {/* Privacy Content */}
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          {/* Section 1 - Introducao */}
          <section id="introducao" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <FileText className="h-5 w-5 text-blue-500" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold m-0">1. Introducao</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  A <strong>Quayer</strong> (&quot;nos&quot;, &quot;nosso&quot; ou &quot;Empresa&quot;) esta comprometida com a protecao da sua privacidade.
                  Esta Politica de Privacidade explica como coletamos, usamos, armazenamos e protegemos suas informacoes pessoais
                  quando voce utiliza nossa plataforma de gestao de comunicacao via WhatsApp.
                </p>
                <p>
                  Esta politica foi elaborada em conformidade com a <strong>Lei Geral de Protecao de Dados (LGPD - Lei n. 13.709/2018)</strong>,
                  o <strong>Marco Civil da Internet (Lei n. 12.965/2014)</strong> e demais normas aplicaveis a protecao de dados pessoais no Brasil.
                </p>
                <p>
                  Ao utilizar nossos servicos, voce declara ter lido, compreendido e concordado com os termos desta Politica de Privacidade.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Section 2 - Dados Coletados */}
          <section id="dados-coletados" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Database className="h-5 w-5 text-purple-500" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold m-0">2. Dados Coletados</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>Coletamos diferentes categorias de dados para fornecer e melhorar nossos servicos:</p>

                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold mb-2">Dados de Cadastro</h4>
                    <ul className="list-disc pl-6 space-y-1 text-sm">
                      <li>Nome completo e e-mail</li>
                      <li>Numero de telefone</li>
                      <li>Dados da empresa (CNPJ, razao social, endereco)</li>
                      <li>Credenciais de acesso (senha criptografada)</li>
                    </ul>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold mb-2">Dados de Uso</h4>
                    <ul className="list-disc pl-6 space-y-1 text-sm">
                      <li>Endereco IP e localizacao aproximada</li>
                      <li>Tipo de navegador e dispositivo</li>
                      <li>Paginas visitadas e tempo de permanencia</li>
                      <li>Acoes realizadas na plataforma</li>
                    </ul>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold mb-2">Dados de Comunicacao</h4>
                    <ul className="list-disc pl-6 space-y-1 text-sm">
                      <li>Mensagens enviadas e recebidas via WhatsApp</li>
                      <li>Historico de conversas</li>
                      <li>Arquivos de midia compartilhados</li>
                      <li>Dados de contatos sincronizados</li>
                    </ul>
                  </div>
                </div>

                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-sm flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" aria-hidden="true" />
                    <span>
                      <strong>Importante:</strong> Nao coletamos dados sensiveis como origem racial, conviccoes religiosas,
                      dados de saude ou dados biometricos, exceto quando estritamente necessario e com consentimento explicito.
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Section 3 - Finalidade */}
          <section id="finalidade" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Eye className="h-5 w-5 text-green-500" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold m-0">3. Finalidade do Tratamento</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>Utilizamos seus dados pessoais para as seguintes finalidades:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Prestacao e melhoria dos servicos contratados</li>
                  <li>Autenticacao e seguranca da conta</li>
                  <li>Comunicacao sobre atualizacoes e suporte</li>
                  <li>Processamento de pagamentos e cobrancas</li>
                  <li>Cumprimento de obrigacoes legais</li>
                  <li>Analise de uso e otimizacao da plataforma</li>
                  <li>Prevencao de fraudes e atividades ilicitas</li>
                  <li>Personalizacao da experiencia do usuario</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Section 4 - Base Legal */}
          <section id="base-legal" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-indigo-500/10">
                <Shield className="h-5 w-5 text-indigo-500" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold m-0">4. Base Legal para o Tratamento</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>O tratamento de dados pessoais pela Quayer e fundamentado nas seguintes bases legais previstas na LGPD:</p>

                <div className="space-y-3">
                  <p><strong>Execucao de Contrato (Art. 7, V):</strong> Para prestacao dos servicos contratados e gestao do relacionamento comercial.</p>
                  <p><strong>Consentimento (Art. 7, I):</strong> Para comunicacoes de marketing e funcionalidades opcionais.</p>
                  <p><strong>Legitimo Interesse (Art. 7, IX):</strong> Para melhorias da plataforma, seguranca e prevencao de fraudes.</p>
                  <p><strong>Cumprimento de Obrigacao Legal (Art. 7, II):</strong> Para atender requisitos legais, fiscais e regulatorios.</p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Section 5 - Compartilhamento */}
          <section id="compartilhamento" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <Users className="h-5 w-5 text-cyan-500" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold m-0">5. Compartilhamento de Dados</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>Seus dados podem ser compartilhados nas seguintes situacoes:</p>

                <p><strong>Prestadores de Servicos:</strong> Empresas parceiras que nos auxiliam na operacao (processamento de pagamentos, hospedagem, analise de dados), sempre sob contratos de confidencialidade e protecao de dados.</p>

                <p><strong>Integracao com WhatsApp:</strong> Dados necessarios para funcionamento da API do WhatsApp Business, conforme termos da Meta.</p>

                <p><strong>Obrigacoes Legais:</strong> Quando exigido por lei, ordem judicial ou autoridade competente.</p>

                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-sm flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-600" aria-hidden="true" />
                    <span>
                      <strong>Garantia:</strong> Nunca vendemos ou compartilhamos seus dados pessoais para fins
                      de marketing de terceiros sem seu consentimento explicito.
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Section 6 - Armazenamento */}
          <section id="armazenamento" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-slate-500/10">
                <Server className="h-5 w-5 text-slate-500" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold m-0">6. Armazenamento de Dados</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>Seus dados sao armazenados em servidores seguros com as seguintes caracteristicas:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Localizacao:</strong> Servidores no Brasil e/ou em paises com nivel adequado de protecao de dados</li>
                  <li><strong>Criptografia:</strong> Dados criptografados em transito (TLS) e em repouso (AES-256)</li>
                  <li><strong>Redundancia:</strong> Backups automaticos e infraestrutura com alta disponibilidade</li>
                  <li><strong>Certificacoes:</strong> Provedores com certificacoes ISO 27001 e SOC 2</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Section 7 - Seguranca */}
          <section id="seguranca" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Lock className="h-5 w-5 text-red-500" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold m-0">7. Medidas de Seguranca</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>Implementamos medidas tecnicas e organizacionais para proteger seus dados:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Criptografia de ponta a ponta para dados sensiveis</li>
                  <li>Autenticacao de dois fatores (2FA) e Passkeys</li>
                  <li>Monitoramento continuo de acessos e ameacas</li>
                  <li>Politicas de acesso baseadas em privilegio minimo</li>
                  <li>Auditorias de seguranca periodicas</li>
                  <li>Treinamento da equipe em protecao de dados</li>
                  <li>Plano de resposta a incidentes de seguranca</li>
                  <li>Testes de penetracao regulares</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Section 8 - Direitos */}
          <section id="direitos" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <UserCheck className="h-5 w-5 text-emerald-500" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold m-0">8. Seus Direitos (LGPD)</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>Como titular de dados, voce possui os seguintes direitos garantidos pela LGPD:</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Eye className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      <h4 className="font-semibold">Acesso</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">Solicitar confirmacao e acesso aos dados que possuimos sobre voce.</p>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Edit className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      <h4 className="font-semibold">Correcao</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">Solicitar a correcao de dados incompletos, inexatos ou desatualizados.</p>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Trash2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      <h4 className="font-semibold">Eliminacao</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">Solicitar a exclusao de dados desnecessarios ou tratados em desconformidade.</p>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Download className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      <h4 className="font-semibold">Portabilidade</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">Solicitar a portabilidade dos dados a outro fornecedor de servico.</p>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      <h4 className="font-semibold">Oposicao</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">Opor-se ao tratamento realizado com base em legitimo interesse.</p>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      <h4 className="font-semibold">Informacao</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">Ser informado sobre compartilhamento de dados com terceiros.</p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  Para exercer seus direitos, entre em contato conosco atraves do e-mail <strong>privacidade@quayer.com</strong> ou
                  utilize o formulario disponivel em sua conta. Responderemos em ate 15 dias uteis.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Section 9 - Cookies */}
          <section id="cookies" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Globe className="h-5 w-5 text-yellow-500" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold m-0">9. Cookies e Tecnologias Similares</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>Utilizamos cookies e tecnologias similares para melhorar sua experiencia:</p>

                <p><strong>Cookies Essenciais:</strong> Necessarios para o funcionamento basico da plataforma (autenticacao, seguranca).</p>
                <p><strong>Cookies de Desempenho:</strong> Ajudam a entender como voce usa a plataforma para melhorias.</p>
                <p><strong>Cookies de Funcionalidade:</strong> Permitem lembrar suas preferencias e personalizar a experiencia.</p>

                <p className="text-sm text-muted-foreground">
                  Voce pode gerenciar suas preferencias de cookies nas configuracoes do navegador.
                  Note que desabilitar certos cookies pode afetar a funcionalidade da plataforma.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Section 10 - Retencao */}
          <section id="retencao" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-pink-500/10">
                <Clock className="h-5 w-5 text-pink-500" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold m-0">10. Retencao de Dados</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>Mantemos seus dados pelo tempo necessario para cumprir as finalidades descritas:</p>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm" role="table">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-semibold" scope="col">Tipo de Dado</th>
                        <th className="text-left p-3 font-semibold" scope="col">Periodo de Retencao</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-3">Dados de cadastro</td>
                        <td className="p-3">Durante a vigencia da conta + 5 anos</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-3">Historico de mensagens</td>
                        <td className="p-3">Conforme configuracao do usuario (padrao: 90 dias)</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-3">Dados financeiros</td>
                        <td className="p-3">5 anos (obrigacao fiscal)</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-3">Logs de acesso</td>
                        <td className="p-3">6 meses (Marco Civil da Internet)</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-3">Dados de analytics</td>
                        <td className="p-3">26 meses (anonimizados apos)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-sm text-muted-foreground">
                  Apos os periodos indicados, os dados serao excluidos ou anonimizados, exceto quando
                  houver obrigacao legal de retencao ou interesse legitimo justificado.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Section 11 - Menores */}
          <section id="menores" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <AlertTriangle className="h-5 w-5 text-orange-500" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold m-0">11. Menores de Idade</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  Nossos servicos sao destinados a maiores de 18 anos ou pessoas juridicas. Nao coletamos
                  intencionalmente dados de menores de idade.
                </p>

                <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                  <p className="text-sm">
                    Se tomarmos conhecimento de que coletamos dados de um menor sem o consentimento
                    apropriado dos responsaveis, tomaremos medidas para excluir essas informacoes o mais
                    rapido possivel. Se voce acredita que temos dados de um menor, entre em contato conosco.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Section 12 - Alteracoes */}
          <section id="alteracoes" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-violet-500/10">
                <Edit className="h-5 w-5 text-violet-500" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold m-0">12. Alteracoes nesta Politica</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  Podemos atualizar esta Politica de Privacidade periodicamente para refletir mudancas em
                  nossas praticas ou requisitos legais.
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Notificaremos sobre alteracoes significativas por e-mail ou aviso na plataforma</li>
                  <li>A data da ultima atualizacao sera sempre indicada no topo do documento</li>
                  <li>O uso continuado apos alteracoes implica aceitacao da nova versao</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Section 13 - Contato */}
          <section id="contato" className="scroll-mt-24 mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Mail className="h-5 w-5 text-blue-500" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold m-0">13. Contato e Encarregado (DPO)</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>Para duvidas, solicitacoes ou exercicio de direitos relacionados a esta Politica de Privacidade:</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                    <Mail className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-sm text-muted-foreground">DPO</p>
                      <p className="font-medium">dpo@quayer.com</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                    <Mail className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-sm text-muted-foreground">Privacidade</p>
                      <p className="font-medium">privacidade@quayer.com</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                    <Mail className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-sm text-muted-foreground">Suporte</p>
                      <p className="font-medium">suporte@quayer.com</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                    <Globe className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-sm text-muted-foreground">Site</p>
                      <p className="font-medium">quayer.com</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg mt-4">
                  <h4 className="font-semibold mb-2">Autoridade Nacional de Protecao de Dados (ANPD)</h4>
                  <p className="text-sm">
                    Caso entenda que o tratamento de seus dados pessoais viola a legislacao aplicavel,
                    voce tem direito de apresentar reclamacao junto a ANPD.
                  </p>
                  <p className="text-sm mt-2">
                    <strong>Site:</strong> www.gov.br/anpd
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>

        <Separator className="my-12" />

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>Documento atualizado em 12 de Dezembro de 2024</p>
          <p className="mt-2">
            <Link href="/termos" className="text-primary hover:underline">
              Ver Termos de Servico
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
