# Quayer — Conceito Primário
> Versão: 1.0 | Data: 2026-04-09 | Status: Validado em sessão de brainstorming

---

## O QUE É

**Quayer é a plataforma especialista em criar experiências de IA no WhatsApp e Instagram.**

Não é um construtor de chatbots genérico.
Não é uma ferramenta de automação horizontal.
É um **especialista de canal** — como Lovable é especialista em web apps, Quayer é especialista em WhatsApp + Instagram.

```
Lovable    →  vertical = WEB APPS
              "crie um app web com IA, sem programar"

Cursor     →  vertical = CÓDIGO
              "escreva código melhor com IA"

Quayer     →  vertical = WHATSAPP + INSTAGRAM
              "crie qualquer experiência de IA
               onde seu cliente já está"
```

---

## PARA QUEM

### Criador (primário)
Influencer, especialista, agência — qualquer pessoa que tem audiência e quer lançar um produto de IA.

```
Perfil:
├── 5k-500k seguidores em qualquer nicho
├── Já vende curso, mentoria ou serviço
├── Aluno assiste mas não aplica (churn alto)
└── Quer produto que FAÇA o trabalho, não só ensine
```

### PME (secundário)
Escritório, clínica, construtora, e-commerce — qualquer negócio que quer IA no canal onde o cliente já está.

```
Perfil:
├── Recebe leads ou clientes via WhatsApp hoje
├── Perde atendimento fora do horário comercial
├── Sem equipe técnica para integrar APIs
└── Quer resultado em dias, não meses
```

---

## POR QUE EXISTE

### O problema em uma frase

> **"Quem tem audiência não tem produto. Quem tem produto não sabe distribuir. E ambos estão ignorando o maior canal do Brasil."**

### Decomposição (Capsula One — JTBD)

| Persona | Job principal | Dor real | Alternativa atual |
|---------|--------------|----------|-------------------|
| Criador | Monetizar audiência com produto recorrente que entrega resultado | Só consegue vender conhecimento (curso), não execução | Contratar dev (R$10-50k), demorar 3 meses, quebrar na manutenção |
| PME | Captar e atender clientes no WhatsApp 24h | Perde lead fora do horário. Secretária custa R$2.500/mês | Bot genérico sem IA, ou nenhum (responde manualmente) |

---

## JOB TO BE DONE (Capsula One Framework)

### JTBD Principal — Criador

> *"Quando quero transformar minha expertise em um produto de IA que minha audiência paga todo mês, quero construí-lo no WhatsApp e Instagram — onde meu seguidor já está — sem precisar de dev, sem esperar meses, para finalmente ter receita recorrente que não depende de lançamento."*

**Dimensões do Job:**

| Dimensão | Descrição |
|----------|-----------|
| **Funcional** | Criar, publicar e vender um agente de IA no WhatsApp/Instagram |
| **Emocional** | Sentir que tem um produto real, não só um curso |
| **Social** | Ser visto como referência em IA no seu nicho |

**Progresso desejado:**

```
ANTES (situação atual):
├── Tem audiência engajada
├── Vende curso com churn de 40-60%
├── Receita instável (depende de lançamento)
└── Aluno não aplica, resultado não vem

DEPOIS (com Quayer):
├── Produto de IA rodando no WhatsApp
├── Aluno "usa" em vez de "assiste"
├── MRR previsível, churn < 10%
└── Resultado real = retenção + indicação
```

### JTBD Secundário — PME

> *"Quando recebo mais leads do que consigo atender, quero um agente que qualifique e responda no WhatsApp 24h, para fechar mais contratos sem contratar secretária e sem ficar preso no celular."*

---

## O QUE O PRODUTO HABILITA

WhatsApp e Instagram como **runtime** de experiências de IA — não só chatbot:

```
HOJE (o que existe):           QUAYER (o que é possível):
───────────────────────────    ────────────────────────────────────
Bot de FAQ simples         →   Agente IA que conversa, qualifica, agenda
Resposta automática básica →   Micro-app dentro do WhatsApp
Atendimento humano manual  →   IA que transfere para humano no momento certo
Campanha de texto estático →   Campanha interativa com IA + resposta dinâmica
                               Produto do influencer rodando no WA do aluno
                               Agente de captação no Instagram DM
```

---

## DIFERENCIAL REAL (não é tecnologia)

1. **Especialização de canal** — WhatsApp + Instagram com profundidade, não superficialmente
2. **Builder com IA** — o agente é criado via conversa, não formulário
3. **98% do Brasil já está no WhatsApp** — zero fricção de adoção
4. **Distribuição via criador** — CAC próximo de zero via influencer-sócio
5. **Multi-tenant pronto** — influencer vende para 100 clientes, cada um isolado

---

## O QUE NÃO É (Non-Goals)

```
❌ Não é Zapier/Make (automação genérica horizontal)
❌ Não é MindStudio (builder sem especialização de canal)
❌ Não é agência de chatbot (serviço, não produto)
❌ Não é plataforma de cursos (Hotmart, Kiwify)
❌ Não é ferramenta de atendimento (Zendesk, Intercom)
```

---

## TENSÃO ESTRATÉGICA — RESOLVER ANTES DE AVANÇAR

Existem atualmente **três visões paralelas** no projeto. Precisam convergir:

```
VISÃO A: BUILDER SELF-SERVICE (architecture-v5.3)
  Criador usa Builder AI para montar agente no WhatsApp
  → GTM: produto self-service, influencer traz audiência

VISÃO B: PLATAFORMA MARKETPLACE (business-strategy.md)
  Influencer-sócio + Gabriel constroem juntos, split 50/50
  → GTM: parceria 1:1 com influencer, concierge manual

VISÃO C: B2B ENTERPRISE (MAPA_SETORES_QUAYER.md)
  Quayer vende para iFood, Rappi, e-commerce como B2B
  → GTM: sales enterprise, ciclo longo, ticket alto

PROBLEMA: São três empresas diferentes.
São três CACs diferentes.
São três produtos diferentes.
São três modelos de receita diferentes.

Só uma pode ser a v1.
```

---

## RECOMENDAÇÃO (Capsula One — Beachhead)

**v1 deve ser VISÃO A + B combinadas, ignorando C:**

```
Quayer v1 = Builder self-service
              + parceria com 1-2 influencers de nicho
              + WhatsApp primeiro, Instagram na v2

Por quê não C (B2B enterprise):
├── Ciclo de venda de 3-6 meses
├── Integração com sistemas legados complexa
├── CAC muito alto sem capital
└── Distância do produto atual (não é o que o Builder faz)
```

---

## MODELO DE NEGÓCIO (síntese)

```
CRIADOR paga Quayer:
  R$297-997/mês para usar o Builder + infraestrutura WA/IG
  BYOK obrigatório para agente em produção (chave OpenAI/Claude própria)

COMPRADOR FINAL paga o CRIADOR:
  R$X/mês pelo produto (agente IA) que o criador montou
  Quayer retém % dessa transação na fase marketplace (v3)

SPLIT (fase concierge):
  50% Gabriel + 50% influencer-sócio nas vendas brutas
```

---

## PRÓXIMOS PASSOS (Capsula One — onde estamos)

```
✅ 1. Segmentar Mercado      FEITO (canal = WhatsApp/IG)
⚡ 2. Descobrir Cliente      URGENTE (entrevistas com criadores)
⚡ 3. Validar Solução        URGENTE (5 criadores usando manualmente)
⏳ 4. Problem/Solution Fit   EM ANDAMENTO
⏳ 5. Concierge Manual       PRÓXIMO
❌ 6+ Tudo mais              NÃO FAZER AINDA
```

**O produto Builder não deve ser construído antes de 5 criadores reais usarem a versão manual e pagarem.**

---

*Documento gerado em sessão de brainstorming — 2026-04-09*
*Referências: architecture-v5.3.md | QUAYER_BUSINESS_STRATEGY.md | MAPA_SETORES_QUAYER.md | Capsula One (FGV Ventures)*
