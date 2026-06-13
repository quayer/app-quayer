---
Criado: 2026-06-13
Atualizado: 2026-06-13
Revisar em: ao transformar estes itens em /plan ou quando mudar mission-first-v3 / integration-builder
Relacionados:
  - specs/jornada-builder-v2/spec.md
  - specs/jornada-builder-v2/mission-first-v3.md
  - specs/integration-builder/plan.md
  - docs/builder/JORNADA_V2_CARDS_TABS_BACKEND.md
---

# Backlog Simples — Melhorias Conversadas para o Builder

> Objetivo: consolidar as ideias discutidas em 2026-06-13 em um backlog de produto simples.
> Este arquivo não substitui as specs; ele serve como fila de priorização.

## P0 — Corrigir a jornada para "missão primeiro"

### 1. Card "Missão do agente" antes do Plano de atendimento

**Problema:** hoje o Builder pula de fonte analisada para "Roteiro da conversa", antes de confirmar qual trabalho o agente deve cumprir.

**Proposta:** depois de objetivo + fonte, mostrar 3-5 missões contextualizadas ao negócio.

Exemplo para SDR imobiliário:

- Qualificar interessados e enviar para vendas.
- Captar lista de interesse.
- Agendar visita ou conversa.
- Tirar dúvidas e enviar materiais.
- Pré-venda completa.

**Status:** já especificado em `mission-first-v3.md`.

### 2. Renomear "Roteiro da conversa" para "Plano de atendimento"

**Problema:** "roteiro" soa técnico e aparece cedo demais.

**Proposta:** o plano deve ser consequência de missão + capacidades + qualificação + restrições.

**Critério:** não mostrar botão "Gerar roteiro" em branco antes de resolver missão e regras.

### 3. Mover decisão de restrição comercial para card próprio

**Problema:** no caso Vibra Butantã, a decisão "100% vendido/esgotado" apareceu dentro do card de roteiro.

**Proposta:** criar/usar card "Restrições comerciais" antes do Plano de atendimento.

Exemplo:

- Lista de interesse.
- Confirmar com consultor.
- Tenho disponibilidade.

## P0 — Capacidades dinâmicas

### 4. Card "Capacidades do agente" contextualizado

**Problema:** o usuário precisa entender o que o agente pode fazer antes de aprovar o plano.

**Proposta:** backend recomenda capacidades conforme objetivo, negócio, risco e ferramentas disponíveis.

Exemplo para SDR imobiliário:

- Responder dúvidas sobre o empreendimento.
- Capturar lead.
- Qualificar interesse.
- Transferir para consultor.
- Enviar fotos/mídias.
- Agendar visita.
- Fazer follow-up.
- Enviar lead para CRM.

Exemplo para clínica:

- Agendar consulta.
- Confirmar presença.
- Enviar lembrete.
- Reagendar.
- Transferir para recepção.

### 5. Backend recomendador de capacidades

**Problema:** o front não deve carregar a inteligência de negócio.

**Proposta:** criar função/camada backend:

```ts
recommendAgentCapabilities(builderState)
```

Ela retorna:

- capacidade;
- recomendada ou opcional;
- motivo;
- dependências;
- risco;
- configuração inicial.

## P0 — Playbook Engine / biblioteca de estratégias

### 6. Biblioteca interna de playbooks

**Problema:** agentes diferentes exigem estratégias diferentes: SDR, closer, secretária, suporte, cobrança, pós-venda.

**Proposta:** criar `AgentStrategy` interno com:

- role;
- businessType;
- objective;
- framework interno;
- campos de qualificação;
- ferramentas recomendadas;
- guardrails;
- regras de handoff;
- critérios de sucesso.

**Observação:** não expor BANT, SPIN, MEDDIC ou nomes técnicos na UI.

### 7. Três modos de construção

**Proposta:**

- **Recomendado:** monta uma versão inicial com objetivo + fonte + boas práticas.
- **Pesquisa:** usa Tavily para pesquisar mercado, concorrentes e referências antes de propor.
- **Livre:** usuário descreve como quer e o Builder adapta.

**Status:** já contemplado em `mission-first-v3.md`, mas precisa virar implementação.

## P1 — Pesquisa estratégica com Tavily

### 8. Usar Tavily como motor de pesquisa do Builder

**Decisão:** Tavily é melhor para pesquisa; Firecrawl/Crawlee ficam como opção futura para leitura profunda de páginas específicas.

**Usos:**

- pesquisar nicho;
- pesquisar concorrentes;
- levantar boas práticas comerciais;
- buscar regulamentações;
- investigar integrações;
- enriquecer playbooks por vertical.

### 9. Card "Pesquisa estratégica" / "Diagnóstico"

**Proposta:** no Modo Pesquisa, mostrar:

- negócio detectado;
- objetivo provável;
- produto principal;
- riscos;
- canais prováveis;
- ferramentas úteis;
- missões recomendadas.

## P1 — Critérios de qualificação

### 10. Card "Critérios de qualificação"

**Problema:** SDR precisa saber qual lead é bom, mas isso não deve ser um roteiro engessado.

**Proposta:** mostrar apenas quando a missão envolver qualificação.

Exemplo imobiliário:

- nome;
- interesse: morar ou investir;
- prazo de compra;
- faixa de orçamento;
- forma de pagamento;
- região;
- interesse em falar com consultor;
- planta/quartos, se fizer sentido.

## P1 — Integrações e ferramentas personalizadas

### 11. Entrada de ferramentas personalizadas via Capacidades

**Problema:** criar ferramenta personalizada não deve ficar escondido em área técnica.

**Proposta:** em Capacidades, permitir:

- Enviar lead para CRM.
- Chamar API/webhook.
- Conectar ferramenta externa.

Se escolher "Outra ferramenta", aciona Integration Builder.

### 12. Manter ativação da integração só após existir agente

**Regra:** o usuário pode pedir/criar/testar integração antes, mas ativar para runtime só depois de `aiAgentId`.

**Fonte:** alinhado com `specs/integration-builder/plan.md`.

### 13. Reposicionar UI de integrações

**Hoje/Plano:** fallback no `AdvancedTab`.

**Proposta de UX:** mover a entrada principal para Capacidades. Avançado fica como área de gestão posterior.

## P1 — Proatividade: follow-up e mensagens programadas

### 14. Capacidade "Follow-up automático"

**Problema:** agente atual é reativo; SDR/closer precisam retomar leads parados.

**Proposta:** capacidade opcional:

- lead demonstrou interesse e parou de responder;
- lead recebeu preço/proposta e não respondeu;
- lead pediu retorno depois;
- lead aceitou falar com consultor mas sumiu.

**Regras mínimas:**

- desligado por padrão;
- recomendado para SDR/closer/cobrança/pós-venda;
- limite de tentativas;
- cancelar quando cliente responder;
- respeitar opt-out;
- auditar envios.

### 15. Tool runtime `create_followup`

**Proposta backend:**

```ts
create_followup({
  contactId,
  reason,
  scheduledAt,
  messageGoal,
  maxAttempts,
  cancelIfCustomerReplies: true
})
```

**Infra necessária:** BullMQ/job agendado + cancelamento por resposta inbound.

### 16. Capacidade "Lembretes automáticos"

**Casos:**

- lembrete de visita;
- confirmação de consulta/reunião;
- lembrete 24h antes;
- lembrete 2h antes;
- pós-atendimento;
- reagendamento se não confirmar.

**Exemplo imobiliário:** visita marcada -> lembrar 2h antes.

**Exemplo clínica:** consulta marcada -> confirmar 24h antes.

### 17. Capacidade "Datas importantes"

**Casos:**

- aniversário;
- renovação de contrato;
- vencimento;
- retorno periódico;
- pós-compra.

**Dependência:** precisa fonte confiável da data: contato, CRM, planilha, integração ou dado coletado na conversa.

### 18. Motor genérico de automações programadas

**Proposta:** não criar uma ferramenta separada para cada caso; criar um motor:

```ts
ScheduledAutomation {
  trigger:
    | "lead_idle"
    | "appointment_before"
    | "appointment_after"
    | "birthday"
    | "renewal_due"
    | "custom_date"
  timing: unknown
  messageTemplate: string
  cancelRules: string[]
  maxAttempts: number
}
```

## P1 — WhatsApp e compliance operacional

### 19. Janela de 24h e templates

**Problema:** follow-up/lembrete fora da janela de atendimento do WhatsApp precisa usar template aprovado.

**Proposta:** o Builder deve explicar/validar:

- mensagem livre dentro da janela permitida;
- fora da janela, usar template;
- avisar quando o template ainda não existir;
- evitar envio proativo sem opt-in.

### 20. Opt-out e anti-spam

**Regras:**

- parar se cliente responder "parar", "não quero", "remover";
- máximo N mensagens sem resposta;
- não enviar se humano assumiu;
- não enviar se atendimento encerrado;
- registrar motivo do envio.

## P2 — UX de painel e revelação progressiva

### 21. Esconder abas técnicas antes de existir agente

**Manter/reforçar:** `Prompt`, `Testar`, `Config`, `Avançado` e detalhes técnicos não aparecem cedo.

### 22. Revisão final orientada a negócio

**Proposta:** `agent_review` deve mostrar:

- missão;
- capacidades ativas;
- qualificação;
- restrições;
- follow-ups/lembretes se ativos;
- ferramentas/integrações;
- o que o agente nunca pode prometer.

## P2 — Observabilidade e qualidade

### 23. Evals e testes de prompt/agente

**Opções discutidas:**

- Promptfoo para evals/red team;
- Langfuse para tracing/observabilidade;
- manter LiteLLM como gateway operacional.

**Prioridade:** depois da jornada mission-first estar estável.

### 24. Documentação da arquitetura LLM

**Correção de nomenclatura:**

```text
Front-end: não fala com LLM.
Backend: usa primitives do pacote `ai`.
Provider factory: roteia via LiteLLM quando configurado.
```

Evitar escrever "usamos Vercel" como se fosse plataforma.

## Sequência sugerida

1. Missão antes do Plano de atendimento.
2. Capacidades contextualizadas por backend.
3. Critérios de qualificação + restrições comerciais.
4. Tavily como Modo Pesquisa / Diagnóstico.
5. Entrada de integrações via Capacidades.
6. Follow-up automático simples.
7. Lembretes de agenda.
8. Datas importantes.
9. Templates WhatsApp + opt-out/anti-spam.
10. Observabilidade/evals.

## Status de integração (2026-06-13)

Backlog integrado em spec/plan/tasks via workflow multi-agente + verificação adversarial.

| Item | Onde foi parar |
|---|---|
| #1/#2/#3 (missão/plano/restrições) | `mission-first-v3.md` FR-37/38, FR-42, FR-44 (já cobertos) |
| #4/#5 (recomendador) | `mission-first-v3.md` FR-51/52 + NFR-13 · tasks T110-T115 |
| #6 (Playbook Engine) | `mission-first-v3.md` FR-40 (já coberto) |
| #7 (3 modos) | `mission-first-v3.md` FR-39 (já coberto) |
| #8 (Tavily) | `mission-first-v3.md` FR-54 · task T118 |
| #9/#10 (diagnóstico/qualificação) | `mission-first-v3.md` FR-46/47, FR-44 (já cobertos) |
| #11/#12/#13 (ferramentas via Capacidades) | `mission-first-v3.md` FR-43/FR-50 (já cobertos) |
| #14-18 (proatividade) | F1 → `mission-first-v3.md` FR-PRO-01 (task TPRO-F1); F2-F4 runtime → **`specs/builder-proatividade/spec.md`** FR-PRO-02..08 |
| #19/#20 (compliance WhatsApp) | `specs/builder-proatividade/spec.md` FR-PRO-06/07 + NFR-15 |
| #21 (esconder abas) | já contemplado (gating de abas v2) |
| #22 (revisão de negócio) | `mission-first-v3.md` FR-53 · task T116 |
| #23/#24 (evals/doc LLM) | `mission-first-v3.md` FR-P2-01/02 · task T118 |

**Correções de âncora aplicadas (verificação adversarial):** fonte do recomendador = `blueprint.toolTriggers`
(não `AgentStrategy.recommendedTools`, inexistente); `niche-inference` extraído de `designer-input.ts`; gate de
supressão extraído de `canDispatchAgent`; hook inbound em `process-inbound.ts`; `create_followup` é **fantasma**
(implementar do zero); `Campaign` é broadcast (≠ `ScheduledAutomation`); janela 24h modelada mas não enforced;
sem modelo `Contact`/opt-out hoje; LiteLLM já é gateway (não greenfield).

