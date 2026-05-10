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
          Rascunho — texto sujeito a revisão pela equipe jurídica.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Aceitação dos Termos</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá as condições sob as quais o usuário declara
          aceitar integralmente os presentes Termos de Serviço ao utilizar a
          plataforma Quayer — texto a ser redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Descrição do Serviço</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá o escopo dos serviços oferecidos pela Quayer,
          incluindo gestão multi-instância de WhatsApp, automações e
          integrações — texto a ser redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. Cadastro e Conta</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá os requisitos para criação de conta,
          responsabilidades do titular pelas credenciais e regras de
          verificação de identidade — texto a ser redigido por equipe
          jurídica.
        </p>

        <h3 className="text-base font-semibold mt-5 mb-2">
          3.1. Veracidade das Informações
        </h3>
        <p className="text-neutral-700 leading-relaxed">
          Esta subseção descreverá a obrigação do usuário de fornecer dados
          verdadeiros, completos e atualizados — texto a ser redigido por
          equipe jurídica.
        </p>

        <h3 className="text-base font-semibold mt-5 mb-2">
          3.2. Segurança da Conta
        </h3>
        <p className="text-neutral-700 leading-relaxed">
          Esta subseção descreverá a responsabilidade do titular pela guarda
          de senhas, OTPs e tokens de acesso — texto a ser redigido por equipe
          jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Uso Aceitável</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá as condutas permitidas e proibidas no uso da
          plataforma, incluindo restrições contra spam, fraude, automação não
          autorizada e violação dos termos do WhatsApp — texto a ser redigido
          por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Conteúdo do Usuário</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá a titularidade, licenças concedidas à Quayer
          e responsabilidades do usuário sobre mensagens, mídias e dados
          inseridos na plataforma — texto a ser redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          6. Pagamentos e Assinaturas
        </h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá os planos comerciais, ciclos de cobrança,
          política de reembolso, suspensão por inadimplência e reajustes —
          texto a ser redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          7. Propriedade Intelectual
        </h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá a titularidade da Quayer sobre marcas,
          software, design e demais ativos da plataforma, bem como restrições
          de uso — texto a ser redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          8. Limitação de Responsabilidade
        </h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá os limites de responsabilidade da Quayer por
          indisponibilidades, perdas indiretas, falhas de terceiros (Meta,
          provedores de SMS, etc.) e força maior — texto a ser redigido por
          equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">9. Modificações</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá o procedimento de alteração dos Termos, o
          aviso prévio aos usuários e as consequências da continuidade de
          uso após mudanças — texto a ser redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">10. Encerramento</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá as hipóteses de encerramento da relação por
          iniciativa do usuário ou da Quayer, prazo para portabilidade de
          dados e exclusão da conta — texto a ser redigido por equipe
          jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">11. Lei Aplicável</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá a legislação aplicável (Brasil), o foro
          eleito para dirimir conflitos e formas alternativas de resolução
          de disputas — texto a ser redigido por equipe jurídica.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">12. Contato</h2>
        <p className="text-neutral-700 leading-relaxed">
          Esta seção descreverá os canais oficiais de contato para dúvidas
          sobre estes Termos — texto a ser redigido por equipe jurídica.
          Enquanto isso, contate{' '}
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
