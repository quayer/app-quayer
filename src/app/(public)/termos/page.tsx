import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Termos de Serviço — Quayer',
  description:
    'Termos de Serviço da plataforma Quayer — documento em fase de revisão jurídica.',
}

export default function TermosPage() {
  return (
    <main
      className="max-w-3xl mx-auto px-6 py-12"
      style={{ fontFamily: 'var(--font-dm-sans), var(--font-sans)' }}
    >
      <aside
        role="note"
        aria-label="Aviso de revisão jurídica"
        className="bg-amber-50 border-l-4 border-amber-400 p-4 text-sm mb-8"
      >
        <p className="font-medium text-amber-900">
          Este documento está em fase de revisão.
        </p>
        <p className="text-amber-800 mt-1">
          Para esclarecimentos, contate{' '}
          <a
            href="mailto:juridico@quayer.com"
            className="underline hover:no-underline"
          >
            juridico@quayer.com
          </a>
          .
        </p>
      </aside>

      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Termos de Serviço
        </h1>
        <p className="text-sm text-neutral-500">
          Rascunho — texto sujeito a revisão pela equipe jurídica. Não constitui
          documento contratual definitivo.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Aceitação dos Termos</h2>
        <p className="text-neutral-700 leading-relaxed">
          Ao criar uma conta, acessar ou utilizar a plataforma Quayer, o usuário
          declara ter lido, compreendido e aceito integralmente estes Termos de
          Serviço, bem como a Política de Privacidade. Caso não concorde com
          qualquer disposição, o usuário deverá interromper imediatamente o uso
          da plataforma. Esta versão do documento ainda está em rascunho e será
          substituída pela redação final aprovada pela equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Descrição do Serviço</h2>
        <p className="text-neutral-700 leading-relaxed">
          A Quayer é uma plataforma multi-tenant que oferece gestão de
          múltiplas instâncias de WhatsApp, automação de atendimento, campanhas,
          fluxos conversacionais, integrações e ferramentas de inteligência
          artificial voltadas a equipes comerciais e de suporte. A
          disponibilidade dos recursos pode variar conforme o plano contratado
          e está sujeita às limitações técnicas dos provedores integrados,
          incluindo a Meta Platforms, Inc., responsável pelo WhatsApp.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. Cadastro e Conta</h2>
        <p className="text-neutral-700 leading-relaxed">
          Para utilizar a Quayer é necessário criar uma conta fornecendo dados
          de identificação verdadeiros e atualizados. O acesso à plataforma é
          pessoal e intransferível, e a conta poderá ser vinculada a uma ou
          mais organizações conforme o modelo de uso contratado.
        </p>

        <h3 className="text-base font-semibold mt-5 mb-2">
          3.1. Veracidade das Informações
        </h3>
        <p className="text-neutral-700 leading-relaxed">
          O usuário compromete-se a fornecer dados verdadeiros, completos e
          atualizados, sendo o único responsável por eventuais consequências
          decorrentes de informações inexatas ou desatualizadas. A Quayer
          poderá solicitar comprovação adicional de identidade sempre que
          considerar necessário para a segurança da plataforma.
        </p>

        <h3 className="text-base font-semibold mt-5 mb-2">
          3.2. Segurança da Conta
        </h3>
        <p className="text-neutral-700 leading-relaxed">
          O titular é responsável pela guarda das credenciais de acesso,
          incluindo senhas, códigos de uso único (OTP), tokens de API e chaves
          de integração. Qualquer atividade realizada com tais credenciais
          será presumida como autorizada pelo titular, que deverá comunicar
          imediatamente a Quayer sobre acessos não autorizados ou suspeitas
          de comprometimento.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Uso Aceitável</h2>
        <p className="text-neutral-700 leading-relaxed">
          O usuário compromete-se a utilizar a plataforma de forma lícita,
          ética e em conformidade com a legislação aplicável e com os termos
          de uso do WhatsApp e demais serviços integrados. É expressamente
          vedado: (i) o envio de mensagens não solicitadas (spam); (ii)
          práticas de fraude, phishing ou engenharia social; (iii) automações
          abusivas que comprometam a integridade dos provedores integrados;
          (iv) coleta indevida de dados de terceiros; (v) qualquer uso que
          viole direitos de propriedade intelectual ou cause dano a outros
          usuários ou à plataforma.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Conteúdo do Usuário</h2>
        <p className="text-neutral-700 leading-relaxed">
          O usuário mantém a titularidade sobre as mensagens, mídias, contatos
          e demais conteúdos inseridos na plataforma, sendo o único
          responsável pela sua legalidade, originalidade e adequação. Ao
          utilizar a Quayer, o usuário concede licença não exclusiva,
          mundial e gratuita para que a plataforma processe, armazene e
          transmita tais conteúdos exclusivamente na medida necessária à
          prestação do serviço.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          6. Pagamentos e Assinaturas
        </h2>
        <p className="text-neutral-700 leading-relaxed">
          A utilização dos planos pagos da Quayer é regida pelos preços,
          ciclos de cobrança e condições descritas no momento da contratação.
          O atraso ou a inadimplência poderão resultar em suspensão temporária
          ou encerramento da conta, observado aviso prévio razoável. Eventuais
          reajustes serão comunicados com antecedência mínima a ser definida
          na versão final deste documento, e a política de reembolso seguirá
          as regras do Código de Defesa do Consumidor quando aplicável.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          7. Propriedade Intelectual
        </h2>
        <p className="text-neutral-700 leading-relaxed">
          Todos os direitos sobre a marca, o software, o design, a
          documentação e demais ativos da plataforma pertencem à Quayer ou a
          seus licenciantes. Estes Termos não conferem ao usuário qualquer
          direito de reprodução, redistribuição, engenharia reversa ou criação
          de obras derivadas, exceto nos limites expressamente autorizados por
          contrato específico.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          8. Limitação de Responsabilidade
        </h2>
        <p className="text-neutral-700 leading-relaxed">
          A Quayer envida esforços razoáveis para manter a plataforma
          disponível e segura, mas não garante operação ininterrupta ou livre
          de falhas. Na máxima extensão permitida em lei, a Quayer não
          responderá por danos indiretos, lucros cessantes ou perdas
          decorrentes de indisponibilidades de provedores terceiros (Meta,
          gateways de SMS, provedores de nuvem, modelos de IA), eventos de
          força maior ou uso indevido da plataforma pelo usuário.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">9. Modificações</h2>
        <p className="text-neutral-700 leading-relaxed">
          A Quayer poderá atualizar estes Termos a qualquer tempo para
          refletir mudanças legais, comerciais ou técnicas. Alterações
          relevantes serão comunicadas por e-mail ou aviso na plataforma com
          antecedência razoável, e o uso continuado após a entrada em vigor
          das novas condições constituirá aceitação tácita pelo usuário.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">10. Encerramento</h2>
        <p className="text-neutral-700 leading-relaxed">
          O usuário poderá encerrar sua conta a qualquer momento por meio das
          opções disponíveis na plataforma ou pelo canal de contato. A Quayer
          poderá suspender ou encerrar contas em caso de violação destes
          Termos, ordem judicial ou descontinuidade do serviço, observado o
          direito do usuário à portabilidade de seus dados nos termos da
          legislação aplicável.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">11. Lei Aplicável</h2>
        <p className="text-neutral-700 leading-relaxed">
          Estes Termos são regidos pelas leis da República Federativa do
          Brasil. As partes elegem o foro da comarca da sede da Quayer em São
          Paulo, Brasil, para dirimir quaisquer controvérsias, sem prejuízo
          do uso de meios alternativos de resolução de disputas, como
          mediação e arbitragem, quando aplicáveis.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">12. Contato</h2>
        <p className="text-neutral-700 leading-relaxed">
          Dúvidas, notificações ou solicitações relacionadas a estes Termos
          devem ser direcionadas para{' '}
          <a
            href="mailto:juridico@quayer.com"
            className="underline hover:no-underline"
          >
            juridico@quayer.com
          </a>
          . Endereço para correspondência: Quayer · São Paulo, Brasil.
        </p>
      </section>
    </main>
  )
}
