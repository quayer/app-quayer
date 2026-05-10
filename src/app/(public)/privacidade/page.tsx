import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade — Quayer',
  description:
    'Política de Privacidade da plataforma Quayer — documento em fase de revisão jurídica.',
}

export default function PrivacidadePage() {
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
            href="mailto:dpo@quayer.com"
            className="underline hover:no-underline"
          >
            dpo@quayer.com
          </a>
          .
        </p>
      </aside>

      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Política de Privacidade
        </h1>
        <p className="text-sm text-neutral-500">
          Rascunho — texto sujeito a revisão pela equipe jurídica e adequação
          à Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Dados Coletados</h2>
        <p className="text-neutral-700 leading-relaxed">
          A Quayer coleta dados pessoais necessários à prestação do serviço,
          organizados em quatro categorias principais: dados cadastrais, dados
          de uso e comunicação, dados técnicos e dados de pagamento. A coleta
          ocorre no momento do cadastro, durante a utilização da plataforma e
          por meio de integrações autorizadas pelo titular ou pela
          organização contratante.
        </p>

        <h3 className="text-base font-semibold mt-5 mb-2">
          1.1. Dados Cadastrais
        </h3>
        <p className="text-neutral-700 leading-relaxed">
          Incluem nome, e-mail, telefone, CPF ou CNPJ, dados da organização e
          credenciais de autenticação. São fornecidos diretamente pelo titular
          no momento do cadastro ou da contratação e atualizados conforme as
          alterações realizadas no perfil.
        </p>

        <h3 className="text-base font-semibold mt-5 mb-2">
          1.2. Dados de Uso e Comunicação
        </h3>
        <p className="text-neutral-700 leading-relaxed">
          Incluem metadados de mensagens trocadas via WhatsApp, registros de
          conexão de instâncias, logs de eventos da plataforma, dados de
          campanhas e fluxos automatizados, bem como interações com agentes
          de inteligência artificial. O conteúdo das mensagens permanece sob
          titularidade da organização contratante e é tratado pela Quayer
          apenas na medida necessária à operação do serviço.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          2. Finalidade do Tratamento
        </h2>
        <p className="text-neutral-700 leading-relaxed">
          Os dados pessoais são tratados pela Quayer para: (i) prestação dos
          serviços contratados e operação técnica da plataforma; (ii)
          autenticação, prevenção a fraudes e segurança da informação; (iii)
          comunicação com o titular sobre o serviço, suporte e atualizações;
          (iv) cumprimento de obrigações legais e regulatórias; e (v)
          melhoria contínua dos produtos com base em dados agregados ou
          anonimizados.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. Base Legal (LGPD)</h2>
        <p className="text-neutral-700 leading-relaxed">
          O tratamento de dados pessoais pela Quayer fundamenta-se nas
          hipóteses do art. 7º da Lei nº 13.709/2018 (LGPD), em especial:
          execução de contrato e procedimentos preliminares (inc. V),
          cumprimento de obrigação legal ou regulatória (inc. II), exercício
          regular de direitos (inc. VI), legítimo interesse do controlador
          (inc. IX) e, quando aplicável, consentimento específico do titular
          (inc. I).
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Compartilhamento</h2>
        <p className="text-neutral-700 leading-relaxed">
          A Quayer compartilha dados pessoais com terceiros apenas na medida
          necessária à prestação do serviço, com destaque para: provedores de
          infraestrutura em nuvem, Meta Platforms (provedora do WhatsApp),
          gateways de pagamento, provedores de e-mail e SMS, e fornecedores
          de modelos de inteligência artificial. Todos os operadores são
          contratualmente obrigados a adotar medidas de proteção compatíveis
          com a LGPD. A Quayer não comercializa dados pessoais de seus
          usuários.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Cookies</h2>
        <p className="text-neutral-700 leading-relaxed">
          A plataforma utiliza cookies e tecnologias similares classificados
          em três categorias: essenciais (autenticação e segurança),
          funcionais (preferências do usuário) e analíticos (métricas
          agregadas de uso). O usuário pode gerenciar cookies não essenciais
          por meio das configurações do navegador, observando que a
          desativação pode comprometer parte das funcionalidades.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">6. Direitos do Titular</h2>
        <p className="text-neutral-700 leading-relaxed">
          Nos termos do art. 18 da LGPD, o titular pode solicitar a qualquer
          momento: confirmação da existência de tratamento; acesso aos dados;
          correção de dados incompletos, inexatos ou desatualizados;
          anonimização, bloqueio ou eliminação de dados desnecessários;
          portabilidade; eliminação dos dados tratados com consentimento;
          informação sobre compartilhamentos realizados; e revogação do
          consentimento. Solicitações devem ser enviadas para{' '}
          <a
            href="mailto:dpo@quayer.com"
            className="underline hover:no-underline"
          >
            dpo@quayer.com
          </a>
          .
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">7. Segurança</h2>
        <p className="text-neutral-700 leading-relaxed">
          A Quayer adota medidas técnicas e administrativas para proteger os
          dados pessoais, incluindo criptografia em trânsito (TLS) e em
          repouso, controle de acesso baseado em papéis, isolamento
          multi-tenant, monitoramento contínuo, registros de auditoria e
          plano de resposta a incidentes de segurança. Em caso de incidente
          que possa acarretar risco relevante aos titulares, a Autoridade
          Nacional de Proteção de Dados (ANPD) e os titulares afetados serão
          comunicados nos prazos exigidos pela legislação.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">8. Retenção</h2>
        <p className="text-neutral-700 leading-relaxed">
          Os dados pessoais são retidos pelo tempo necessário ao cumprimento
          das finalidades para as quais foram coletados ou pelo prazo
          exigido por obrigações legais e regulatórias. Após o término dos
          prazos aplicáveis, os dados são eliminados ou anonimizados, salvo
          quando sua conservação for autorizada por hipótese legal específica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          9. Transferências Internacionais
        </h2>
        <p className="text-neutral-700 leading-relaxed">
          Em razão do uso de provedores globais de nuvem e de modelos de
          inteligência artificial, dados pessoais podem ser transferidos para
          outros países. Tais transferências observam as salvaguardas dos
          arts. 33 a 36 da LGPD, incluindo a contratação de operadores que
          ofereçam grau de proteção adequado e a celebração de cláusulas
          contratuais específicas para a proteção dos titulares.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">10. Encarregado (DPO)</h2>
        <p className="text-neutral-700 leading-relaxed">
          A Quayer designa um Encarregado pelo Tratamento de Dados Pessoais
          (DPO), responsável por receber comunicações dos titulares e da
          ANPD, orientar internamente sobre práticas de proteção de dados e
          executar as demais atribuições previstas no art. 41 da LGPD.
          Contato:{' '}
          <a
            href="mailto:dpo@quayer.com"
            className="underline hover:no-underline"
          >
            dpo@quayer.com
          </a>
          .
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">11. Alterações</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta Política poderá ser atualizada periodicamente para refletir
          mudanças legais, técnicas ou operacionais. A versão vigente estará
          sempre disponível nesta página, com indicação da data da última
          atualização, e mudanças relevantes serão comunicadas por e-mail ou
          aviso na plataforma com antecedência razoável.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">12. Contato</h2>
        <p className="text-neutral-700 leading-relaxed">
          Para o exercício de direitos do titular, dúvidas sobre esta
          Política ou comunicação com o Encarregado, escreva para{' '}
          <a
            href="mailto:dpo@quayer.com"
            className="underline hover:no-underline"
          >
            dpo@quayer.com
          </a>
          . Endereço para correspondência: Quayer · São Paulo, Brasil.
        </p>
      </section>
    </main>
  )
}
