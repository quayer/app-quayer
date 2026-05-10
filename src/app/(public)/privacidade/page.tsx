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
          Política de Privacidade
        </h1>
        <p className="text-sm text-neutral-500">
          Rascunho — texto sujeito a revisão pela equipe jurídica e adequação
          à LGPD (Lei nº 13.709/2018).
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Dados Coletados</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá as categorias de dados pessoais coletados
          pela Quayer (cadastrais, de uso, de comunicação, técnicos) e os
          momentos da coleta — texto a ser redigido por equipe jurídica.
        </p>

        <h3 className="text-base font-semibold mt-5 mb-2">
          1.1. Dados Cadastrais
        </h3>
        <p className="text-neutral-700 leading-relaxed">
          Esta subseção descreverá nome, e-mail, telefone, CPF/CNPJ e demais
          dados informados no cadastro — texto a ser redigido por equipe
          jurídica.
        </p>

        <h3 className="text-base font-semibold mt-5 mb-2">
          1.2. Dados de Uso e Comunicação
        </h3>
        <p className="text-neutral-700 leading-relaxed">
          Esta subseção descreverá metadados de mensagens, conexões com
          WhatsApp, logs de eventos e dados de campanhas — texto a ser
          redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          2. Finalidade do Tratamento
        </h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá as finalidades específicas do tratamento de
          cada categoria de dado (prestação do serviço, segurança, suporte,
          melhorias, obrigações legais) — texto a ser redigido por equipe
          jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. Base Legal (LGPD)</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá as hipóteses legais que autorizam o
          tratamento (art. 7º da LGPD), tais como execução de contrato,
          legítimo interesse, cumprimento de obrigação legal e
          consentimento — texto a ser redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Compartilhamento</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá com quais terceiros os dados são
          compartilhados (operadores, provedores de infraestrutura, Meta /
          WhatsApp, gateways de pagamento) e as garantias contratuais
          aplicáveis — texto a ser redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Cookies</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá os tipos de cookies utilizados (essenciais,
          analíticos, de preferência), sua finalidade e como o usuário pode
          gerenciá-los — texto a ser redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">6. Direitos do Titular</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá os direitos garantidos pela LGPD (art. 18) —
          confirmação, acesso, correção, anonimização, portabilidade,
          eliminação, informação sobre compartilhamento e revogação de
          consentimento — e os canais para exercê-los — texto a ser redigido
          por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">7. Segurança</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá as medidas técnicas e administrativas
          adotadas para proteger dados pessoais (criptografia em trânsito e
          repouso, controle de acesso, monitoramento, plano de resposta a
          incidentes) — texto a ser redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">8. Retenção</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá os prazos de retenção de cada categoria de
          dado e os critérios para descarte ou anonimização — texto a ser
          redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          9. Transferências Internacionais
        </h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá eventuais transferências de dados para
          outros países (provedores de nuvem, sub-operadores) e as
          salvaguardas aplicáveis nos termos dos arts. 33 a 36 da LGPD —
          texto a ser redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">10. Encarregado (DPO)</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção identificará o Encarregado pelo Tratamento de Dados
          Pessoais (DPO) da Quayer e seus contatos oficiais — texto a ser
          redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">11. Alterações</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá o procedimento de atualização desta Política,
          como o usuário será notificado e a versão vigente — texto a ser
          redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">12. Contato</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá os canais oficiais para contato sobre
          privacidade, exercício de direitos do titular e comunicação com
          o DPO — texto a ser redigido por equipe jurídica. Enquanto isso,
          contate{' '}
          <a
            href="mailto:juridico@quayer.com"
            className="underline hover:no-underline"
          >
            juridico@quayer.com
          </a>
          .
        </p>
      </section>
    </main>
  )
}
