# Quayer — Modelo de Negócio
> Versão: 1.0 | Data: 2026-04-10 | Status: Validado em sessão de brainstorming
> Referências: QUAYER_CONCEITO_PRIMARIO.md | architecture-v5.3.md | QUAYER_BUSINESS_STRATEGY.md

---

## 1. O QUE É A QUAYER

**Quayer é a plataforma especialista em deploy e distribuição de agentes de IA no WhatsApp e Instagram.**

A analogia exata:

```
Vercel    →  especialista em web apps     (você cria, eles hospedam)
Lovable   →  especialista em web apps     (IA cria por você)
Quayer    →  especialista em WA + IG      (você cria ou IA cria, Quayer hospeda e distribui)
```

Não é chatbot. Não é automação genérica. Não é Zapier.
É **infraestrutura de canal** — onde o produto final vive no WhatsApp e Instagram.

---

## 2. O PROBLEMA QUE RESOLVE

### Em uma frase

> **"Criar e manter um agente de IA no WhatsApp consome semanas de dev, centenas de reais em VPS, e ainda exige configurar a API do WhatsApp — tudo isso antes de atender o primeiro cliente."**

### Decomposição (sem Quayer vs com Quayer)

```
SEM QUAYER                              COM QUAYER
──────────────────────────────────────  ──────────────────────────────────────
VPS: R$80-300/mês + horas de config    Zero config de servidor
WhatsApp Business API: 1-3 semanas     WA conectado em minutos (QR code)
Instagram API: aprovação Meta           IG integrado (v2)
Agente IA: dias/semanas de dev          Deploy em minutos (CLI ou Builder UI)
Multi-tenant: meses de engenharia       Pronto, isolado por organização
Billing do cliente final: build do zero Asaas/Efi integrado (v2)
Manutenção contínua: custo permanente   Quayer mantém a infra
```

---

## 3. PARA QUEM

### Camada 1 — CRIADOR (paga Quayer)

Três perfis, **mesmo produto**:

#### Dev / Automação
```
Perfil:   Está começando em IA, usa Claude Code ou ferramentas locais
Job:      "Quero dar deploy do meu agente sem configurar VPS e WA API"
Dor:      Perde horas em infra antes de chegar no que importa: o agente
Valor:    Deploy em minutos. Foco no agente, não na infraestrutura.
```

#### Agência de Marketing
```
Perfil:   Agência que quer vender IA como serviço para seus clientes
Job:      "Quero entregar agente IA para meus clientes sem construir infra"
Dor:      Não tem equipe técnica para manter servidor + WA + multi-tenant
Valor:    White-label pronto. Vende para 30 clientes sem engenharia.
```

#### Influencer / Infoprodutor
```
Perfil:   Creator com audiência que quer produto recorrente (não só curso)
Job:      "Quero co-produto de IA que minha audiência paga todo mês"
Dor:      Só consegue vender conhecimento (curso com churn alto)
          Depende de lançamentos, sem MRR previsível
Valor:    Lança produto de IA em dias. Aluno usa, não só assiste.
          Receita recorrente sem dev, sem VPS, sem API.
```

### Camada 2 — CONSUMIDOR FINAL (paga o Criador)

Seguidores do influencer, clientes da agência, leads do negócio — **qualquer nicho**.

Eles nunca contratam Quayer diretamente. Pagam o criador e usam o agente no WhatsApp.

---

## 4. JOB TO BE DONE (Capsula One)

> **Regra:** O JTBD fala da vida que o cliente quer ter — não do produto que você quer vender.
> O produto não aparece no JTBD. A dor e o progresso desejado, sim.

---

### JTBD — Dev / Automação

> *"Quando pego um projeto que precisa de automação no WhatsApp e tenho poucos dias para entregar, quero não desperdiçar metade do prazo configurando servidor, sessão e API, para poder cobrar pelo trabalho que realmente importa — e não pelo trabalho invisível que o cliente nunca vai ver."*

**Progresso desejado:**
```
ANTES:  3 dias perdidos em infra antes de escrever 1 linha de agente
DEPOIS: Entrega no prazo. Margem preservada. Cliente feliz.
```

**Força do job:** É sobre **tempo e dinheiro perdido em trabalho que não gera valor percebido.**

---

### JTBD — Agência de Marketing

> *"Quando meu cliente pede IA e eu tenho que dizer que não sei fazer, ou terceirizar e perder margem, quero ter uma resposta pronta com minha marca para entregar, para não perder o cliente — e o contrato — para quem sabe."*

**Progresso desejado:**
```
ANTES:  "Ainda não trabalhamos com IA" → perde cliente para concorrente
DEPOIS: "Temos solução de IA para WhatsApp" → retém cliente, aumenta ticket
```

**Força do job:** É sobre **medo de perder relevância e receita** no mercado que está mudando.

---

### JTBD — Influencer / Infoprodutor

> *"Quando vejo meu aluno cancelar no terceiro mês porque assistiu tudo mas não aplicou nada, quero dar algo que faça o trabalho por ele e gere resultado real, para parar de depender de lançamento para pagar as contas e ter uma receita que não some quando paro de postar."*

**Progresso desejado:**
```
ANTES:  Aluno compra → assiste → não aplica → cancela → lançamento de novo
DEPOIS: Aluno compra → usa o agente → tem resultado → fica → indica
```

**Força do job:** É sobre **instabilidade de receita e culpa de não entregar resultado para o aluno.**

---

### O que os três JTBDs têm em comum

```
Todos estão perdendo algo HOJE sem saber que existe solução:
├── Dev:          perde tempo e margem em trabalho invisível
├── Agência:      perde clientes por falta de capacidade
└── Influencer:   perde alunos por falta de resultado real

Quayer não vende "agente de IA".
Quayer vende: tempo de volta, cliente retido, aluno com resultado.
```

---

## 5. COMO FUNCIONA — AS DUAS ENTRADAS

**1 produto. 2 formas de criar. Mesmo resultado.**

```
ENTRADA A: CLI (Dev)
  $ quayer deploy
  ├── Cria localmente (Claude Code, Python, Node)
  ├── Faz deploy com 1 comando
  └── Agente live no WhatsApp em minutos

ENTRADA B: Builder UI (Não-técnico)
  ├── Acessa quayer.com
  ├── Digita o que quer criar em linguagem natural
  ├── Builder AI conversa, gera o agente
  └── Agente live no WhatsApp em minutos

RESULTADO FINAL (idêntico):
  Agente publicado, rodando 24h no WhatsApp/Instagram
  Quayer cuida de: servidor, conexão WA, reconexão, uptime
  Criador cuida de: prompt, lógica, relacionamento com cliente
```

---

## 6. MODELO DE RECEITA

### Estrutura de duas camadas

```
CAMADA 1 — Criador paga Quayer
  Assinatura mensal pelo uso da plataforma
  BYOK obrigatório para LLM de produção
  (criador traz sua própria chave OpenAI/Claude)

CAMADA 2 — Consumidor paga Criador
  Criador define o preço do seu produto
  Quayer retém % sobre essa transação
  (fase marketplace — v3, não v1)
```

### Por que BYOK é obrigatório

```
Agente em produção responde 24h no WhatsApp
Volume: 500-2.000 mensagens/mês por organização
Custo LLM: R$80-150/mês por organização (Claude Sonnet)

Se Quayer absorver → margem negativa no plano Maker
Se criador paga direto à OpenAI/Anthropic → Quayer mantém margem
```

O criador configura a chave **uma vez** durante o primeiro deploy. Transparente depois disso.

---

## 7. PLANOS

### Momento de cobrança — DEPLOY (não criação)

```
CRIAR agente      → GRÁTIS (Builder UI + CLI)
TESTAR playground → GRÁTIS (sem WhatsApp real)
FAZER DEPLOY      → REQUER PLANO + BYOK key ← GATE AQUI
```

O pitch de venda acontece no momento de maior motivação:
> *"Seu agente está pronto. Para publicar no WhatsApp, escolha seu plano."*

---

### Tabela de planos

```
┌─────────────────┬──────────────────┬───────────────────────┐
│  MAKER          │  STUDIO          │  AGENCY                │
│  R$197/mês      │  R$497/mês       │  R$1.497/mês           │
├─────────────────┼──────────────────┼───────────────────────┤
│  Dev solo       │  Influencer      │  Agência que revende   │
│  PME pequena    │  Infoprodutor    │  para clientes         │
├─────────────────┼──────────────────┼───────────────────────┤
│  Criar agentes  │  Criar agentes   │  Criar agentes         │
│  ILIMITADO      │  ILIMITADO       │  ILIMITADO             │
│                 │                  │                        │
│  2 agentes live │  5 agentes live  │  15 agentes live       │
│  (2 inst. WA)   │  (5 inst. WA)    │  (15 inst. WA)         │
│                 │                  │                        │
│  CLI + Builder  │  CLI + Builder   │  CLI + Builder         │
│  BYOK           │  BYOK            │  BYOK                  │
│  Playground     │  Analytics       │  White-label           │
│  Suporte email  │  Suporte WA      │  Sub-contas clientes   │
│                 │                  │  Billing integrado     │
│                 │                  │  Onboarding dedicado   │
│                 │                  │  Suporte prioritário   │
└─────────────────┴──────────────────┴───────────────────────┘

INSTÂNCIAS ADICIONAIS (qualquer plano): R$25/instância/mês
```

### Lógica dos valores (ancoragem)

| Plano | Comparação | Por que faz sentido |
|-------|-----------|---------------------|
| R$197 | < 1 dia de dev freelancer | Economiza semanas de config |
| R$497 | < 1h de dev freelancer/mês | 5 agentes live sem VPS |
| R$1.497 | < 1 cliente de agência | Revende para 30 clientes com margem |

### Margem bruta estimada

```
COGS por cliente (com BYOK):
├── Infra servidor:        R$20/mês
├── WA infra por instância: R$10/instância
├── Builder AI sessões:    R$8/mês
└── Ops/suporte:           R$10/mês

MAKER  (2 inst.): COGS ~R$58  | Receita R$197 | Margem ~70%
STUDIO (5 inst.): COGS ~R$88  | Receita R$497 | Margem ~82%
AGENCY (15 inst.): COGS ~R$208 | Receita R$1.497 | Margem ~86%
```

---

## 8. INTEGRAÇÃO FINANCEIRA (Asaas + Efi Bank)

```
ASAAS — Recorrência do criador
  ├── Cobra plano mensal (boleto, PIX, cartão)
  ├── Webhook → libera/suspende plano na Quayer
  ├── Dunning automático (inadimplência)
  └── Dashboard financeiro do criador

EFI BANK — Split com influencer-sócio
  ├── Venda do consumidor final entra
  ├── Split automático via PIX: 50% criador / 50% Quayer (ou configurável)
  ├── Uma chamada de API, dois destinatários
  └── Sem planilha, sem transferência manual
```

---

## 9. CONTROLE DE INSTÂNCIAS WA (billing justo)

```
Instâncias incluídas no plano:    fixas, cobertas pela mensalidade
Instâncias extras:                R$25/mês cada

UX na plataforma:
  Barra de uso: "3/5 instâncias ativas"
  Ao atingir limite: "Adicionar instância — R$25/mês"
  Na fatura: linha separada "2 instâncias extras × R$25 = R$50"
```

---

## 10. OBJETIVOS — O QUE QUEREMOS ALCANÇAR

### Mês 1-3 (Concierge Manual — Capsula One etapa 5)

```
META: 10 criadores pagantes
├── Validar que pagam R$197+ pelo valor
├── Validar que BYOK não é barreira
├── Validar que deploy via CLI ou Builder funciona
└── Coletar depoimentos + unit economics reais
```

### Mês 4-6 (Produto Replicável — etapa 7)

```
META: R$15.000 MRR
├── 30+ criadores ativos
├── Pelo menos 1 agência no plano Agency
├── NPS > 50
└── Churn < 7%
```

### Mês 7-12 (Plataforma — etapa 9)

```
META: R$50.000 MRR
├── 3+ verticais de criadores (devs, agências, influencers)
├── Marketplace % sobre Camada 2 ativado
├── Instagram integrado (v2)
└── LTV/CAC > 10x
```

### Métricas de PMF (Capsula One)

| Métrica | Target | Como medir |
|---------|--------|-----------|
| MRR | R$10k+ | Soma de assinaturas ativas |
| Churn mensal | < 5% | Cancelamentos / total |
| NPS | > 50 | Pesquisa trimestral |
| LTV | > R$3.000 | Cohort 6 meses |
| CAC | < R$500 | Total marketing / novos clientes |
| LTV/CAC | > 6x | Divisão simples |
| Payback | < 3 meses | Meses para recuperar CAC |
| Margem bruta | > 70% | (Receita - COGS) / receita |

---

## 11. O QUE NÃO É (Non-Goals)

```
❌ Não é Zapier/Make (automação horizontal genérica)
❌ Não é MindStudio (builder sem especialização de canal)
❌ Não é agência de chatbot (serviço pontual, não produto)
❌ Não é plataforma de cursos (Hotmart, Kiwify, Lastlink)
❌ Não é ferramenta de atendimento (Zendesk, Intercom)
❌ Não é plataforma de CRM (Hubspot, RD Station)
❌ Não compete com os LLMs (OpenAI, Anthropic) — usa eles
```

---

## 12. DECISÕES TOMADAS (Decision Log)

| # | Decisão | Alternativas | Por quê escolhemos |
|---|---------|-------------|-------------------|
| D1 | Especialização em canal (WA+IG), não em nicho | Especialização em advocacia, delivery, etc. | Canal é o diferencial, nicho é escolha do criador |
| D2 | BYOK obrigatório para produção | Quayer absorve LLM | Margem negativa sem BYOK, inviável financeiramente |
| D3 | Gate de pagamento no deploy, não na criação | Paga antes, freemium | Usuário vê valor antes de pagar — maior conversão |
| D4 | CLI + Builder UI = mesmo produto | Dois produtos separados | 1 produto, 2 entradas — menor complexidade |
| D5 | Criar agentes ilimitado, limit em agentes LIVE | Limitar criação também | Custo real é infra de produção, não dados no banco |
| D6 | Instâncias extras R$25/mês | Ilimitado no Agency | Cada instância tem custo real de infra |
| D7 | Asaas (recorrência) + Efi Bank (split) | Só Stripe, só Asaas | Efi tem PIX split nativo, Asaas tem melhor dunning BR |
| D8 | Marketplace % da Camada 2 na v3 | Marketplace no v1 | Simplifica v1, valida modelo antes de adicionar complexidade |

---

*Documento gerado em sessão de brainstorming — 2026-04-10*
*Próximo passo: validar com 5 criadores reais antes de construir*
