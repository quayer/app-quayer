---
Criado: 2026-06-12
Atualizado: 2026-06-12
Revisar em: antes de quebrar qualquer onda em implementacao
Relacionados:
  - specs/builder-playbook-refinement/spec.md
  - specs/jornada-builder-v2/plan.md
  - specs/integration-builder/plan.md
---

# Plano Tecnico - Builder Playbook & Refining Loop

## 1. Principio de arquitetura

O Builder passa a ter tres camadas separadas:

1. **Orquestrador da jornada**: conversa com o usuario, mostra cards, coleta decisoes.
2. **Conversation Blueprint**: contrato estruturado do comportamento do agente.
3. **Refining Loop**: avaliadores independentes testam se o agente gerado cumpre o contrato.

O prompt final deixa de ser a fonte primaria de verdade. Ele passa a ser uma **compilacao** do blueprint + capacidades + conhecimento confirmado.

## 2. Estado e dados

### 2.1 BuilderState aditivo

Adicionar namespace opcional ao `builderStateSchema`:

```ts
conversationBlueprint?: {
  status: 'draft' | 'proposed' | 'approved' | 'needs_review'
  objective?: string
  niche?: string
  stages: BlueprintStage[]
  questions: BlueprintQuestion[]
  variables: BlueprintVariable[]
  skipRules: BlueprintSkipRule[]
  successCriteria: string[]
  handoffTriggers: string[]
  toolTriggers: BlueprintToolTrigger[]
  objectionRules: BlueprintObjectionRule[]
  doRules: string[]
  dontRules: string[]
  sourceRefs: Array<{ type: 'source' | 'user' | 'default'; label: string }>
  approvedAt?: string
}
```

Sem migration no MVP: vive no JSONB da conversa, como `sourceIngestion` e `integration`.

### 2.2 Refinement persistente

Para MVP rapido, persistir resultado agregado tambem no `builderState`:

```ts
refinement?: {
  status: 'idle' | 'running' | 'passed' | 'failed' | 'needs_user_decision'
  runId?: string
  score?: number
  startedAt?: string
  finishedAt?: string
  checks: RefinementCheckSummary[]
  blockers: RefinementBlocker[]
}
```

Quando houver necessidade de historico completo por execucao, criar tabela propria:

- `BuilderRefinementRun`
- `BuilderRefinementScenario`
- `BuilderRefinementResult`

Decisao tecnica: comecar em JSONB para reduzir blast radius; migrar para tabela quando a UI precisar historico detalhado.

## 3. Novos sub-agentes

### 3.1 `playbook-designer`

Entrada:
- objetivo
- nicho
- dados do site/fonte
- persona/escopo ja coletados
- capacidades ligadas

Saida:
- `ConversationBlueprint` estruturado.

Regras:
- sugerir perguntas por nicho;
- uma pergunta por vez;
- cada pergunta precisa capturar variavel;
- cada variavel precisa ter regra de pulo quando ja conhecida;
- marcar defaults com `[REVISAR]`.

### 3.2 `scenario-generator`

Gera cenarios de teste a partir do blueprint:
- fluxo feliz;
- lead sem paciencia;
- lead que pergunta preco cedo;
- lead que ja forneceu dado que o agente nao deve repetir;
- pergunta fora de escopo;
- pedido de humano;
- falha de ferramenta;
- pergunta sobre foto/midia quando houver catalogo.

### 3.3 `conversation-runner`

Executa simulacoes usando o mesmo prompt, conhecimento e ferramentas que o agente usara.

No MVP pode usar `run_prompt_preview` ou service equivalente ja existente.

### 3.4 Auditores

Cada auditor recebe transcript + tool calls + blueprint:

- `route-auditor`: seguiu etapas?
- `question-auditor`: perguntou uma coisa por vez? pulou pergunta ja respondida?
- `tool-auditor`: chamou ferramenta correta, no momento certo, com parametros obrigatorios?
- `knowledge-auditor`: usou fonte confirmada? inventou?
- `safety-auditor`: violou proibicoes, identidade, dados sensiveis ou compliance?
- `ux-copy-auditor`: mensagem curta, clara, sem bloco gigante?

Saida unica:

```ts
{
  checkId: string
  status: 'pass' | 'warning' | 'fail'
  severity: 'low' | 'medium' | 'high' | 'critical'
  evidence: string
  recommendation: string
  autoFixable: boolean
}
```

## 4. Pipeline novo

### 4.1 Antes do prompt

Fluxo:

1. Usuario informa objetivo.
2. Fontes do negocio enriquecem dados.
3. `playbook-designer` gera blueprint proposto.
4. Card "Roteiro da conversa" renderiza perguntas/etapas.
5. Usuario aprova ou edita.
6. `generate_prompt_anatomy` consome blueprint aprovado.

Mudanca importante: `generate_prompt_anatomy` nao deve aceitar gerar prompt final sem blueprint quando `journeyVersion=2`, exceto fallback legado.

### 4.2 Depois do prompt

Fluxo:

1. Prompt gerado.
2. Agente criado ou preview configurado.
3. `scenario-generator` cria cenarios.
4. `conversation-runner` executa simulacoes.
5. Auditores avaliam.
6. Autocorrecao aplica ajustes no prompt quando seguro.
7. Nova rodada curta valida regressao.
8. UI mostra "Refinando concluido" ou "Precisa decidir".

## 5. Cards e UI

### 5.1 Card `conversation_blueprint`

Objetivo: mostrar como o agente vai conduzir a conversa.

Layout:
- Header: "Roteiro da conversa"
- Resumo: objetivo + quantidade de etapas + quantidade de perguntas.
- Etapas em lista compacta.
- Perguntas em cards pequenos:
  - pergunta;
  - dado capturado;
  - quando pular;
  - acao depois da resposta.
- Acoes:
  - `Usar roteiro`
  - `Editar perguntas`
  - `Gerar outra sugestao`

### 5.2 Recibo apos submit

Todo card de configuracao deve deixar recibo curto no chat:

```text
Roteiro salvo:
- 4 perguntas de qualificacao
- 2 gatilhos de humano
- 1 ferramenta prevista: enviar_lead_rd_station
```

### 5.3 Fase "Refinando"

Visual:
- aparece como etapa entre Testar e Publicar ou como gate dentro de Publicar;
- painel com checks:
  - Roteiro
  - Perguntas
  - Conhecimento
  - Ferramentas
  - Seguranca
  - UX
- cada check pode ter `rodando`, `ok`, `aviso`, `falhou`.

Nao mostrar logs de LLM. Mostrar diagnostico leigo e acao clara.

## 6. Integracoes

A spec `integration-builder` ja cobre pesquisa, credenciais e teste real.

Esta spec adiciona exigencias:

- a integracao precisa virar `toolTriggers` no blueprint;
- o card de roteiro deve mostrar quando a ferramenta sera usada;
- o Refining Loop deve simular pelo menos um cenario que exige a ferramenta;
- o auditor deve validar ausencia de tool, parametro faltante e chamada cedo demais.

Exemplo RD Station:

```text
Quando usar:
Depois que o lead informar nome + email ou telefone e demonstrar interesse real.

Nao usar:
Antes de consentimento/interesse; quando for curiosidade fria; quando faltar dado obrigatorio.
```

## 7. Formatacao dinamica do chat

Criar contrato interno `AssistantUiBlock` para o orquestrador:

```ts
type AssistantUiBlock =
  | { type: 'text'; markdown: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'choices'; options: Array<{ label: string; value: string }> }
  | { type: 'receipt'; title: string; items: string[] }
  | { type: 'carousel'; items: Array<{ imageUrl: string; title?: string; caption?: string }> }
  | { type: 'card_ref'; cardKey: string }
```

No MVP, nao precisa trocar todo renderer. Podemos mapear:
- escolhas -> `quick_reply_chips`;
- recibo -> mensagem sistemica curta;
- carrossel -> componente de card especifico em Fontes/Midias.

## 8. Validadores

Atualizar validacao em camadas:

1. **Blueprint validator**: valida shape e coerencia antes do card.
2. **Prompt validator**: valida anatomia + preservacao do blueprint.
3. **Runtime preview validator**: valida transcript e tool calls.
4. **Publication blocker**: falhas criticas impedem publicar.

## 9. Observabilidade

Eventos:
- `blueprint_generated`
- `blueprint_approved`
- `blueprint_edited`
- `refinement_started`
- `refinement_check_finished`
- `refinement_autofix_applied`
- `refinement_user_decision_required`
- `refinement_passed`
- `refinement_failed`

Metricas:
- tempo ate blueprint;
- taxa de edicao do roteiro;
- score medio por nicho;
- top falhas por auditor;
- quantidade de correcoes automaticas;
- taxa de publicacao apos Refining.

## 10. Ondas de entrega

### Onda 1 - Blueprint sem multiagente

- schema no builderState;
- sub-agent `playbook-designer`;
- card `conversation_blueprint`;
- prompt writer consumindo blueprint;
- validacao basica.

### Onda 2 - UI blocks e recibos

- quick replies dinamicos por objetivo/nicho;
- recibo apos submit;
- reduzir textos longos;
- carrossel compacto no card de fontes.

### Onda 3 - Refining MVP

- scenario generator;
- runner com preview;
- 3 auditores iniciais: roteiro, perguntas, seguranca;
- UI "Refinando";
- score e blockers.

### Onda 4 - Ferramentas e integracoes no Refining

- auditor de ferramentas;
- simulacao de tool calls;
- validacao de RD Station/webhook;
- blockers de tool ausente ou nao validada.

### Onda 5 - Refining completo e autocorrecao

- knowledge auditor;
- UX copy auditor;
- autocorrecao de prompt;
- segunda rodada curta;
- historico de runs se necessario.

## 11. Riscos

- **Custo LLM alto:** limitar cenarios e auditores por fase; cachear quando blueprint nao muda.
- **Latencia:** UI deve mostrar progresso incremental; permitir continuar revisando enquanto refina quando nao houver blocker.
- **Falso positivo:** auditores devem produzir evidencia curta, nao apenas julgamento.
- **Prompt muito longo:** blueprint deve compilar prompts enxutos; validadores devem alertar se estourar tamanho.
- **Ferramenta mock vs real:** testes de tool devem distinguir preview simulado de teste real de credencial.

