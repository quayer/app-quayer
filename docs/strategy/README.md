# Quayer — Strategy

> **Source of truth versionada no Git.**
> Material consolidado da pasta `🚀 Projetos/metodologia/` (que continua existindo como arquivo).

---

## TL;DR

**Quayer é a plataforma especialista em deploy e distribuição de agentes de IA no WhatsApp e Instagram.**

Não é chatbot. Não é Zapier. É **infraestrutura de canal** — como Vercel pra web, Quayer pra WA + IG.

3 ICPs:
- **Dev / Automação** — quer dar deploy sem montar VPS + WA API
- **Agência de marketing** — quer vender IA white-label
- **Influencer / infoprodutor** — quer produto recorrente (não só curso)

Modelo híbrido em 3 fases: Agency Vertical → Vertical AI → Plataforma.

---

## Documentos (ordem de leitura)

| # | Documento | O que tem |
|---|---|---|
| 01 | [Conceito Primário](01-conceito.md) | O que é, para quem, JTBD completo, framework Cápsula One |
| 02 | [Modelo de Negócio](02-modelo-negocio.md) | Pricing, GTM, unit economics, camadas Criador/Consumidor |
| 03 | [Sumário Executivo](03-sumario-executivo.md) | Visão executiva — leitura única pra investidor/parceiro |
| 04 | [Mapa de Setores](04-mapa-setores.md) | Verticais priorizadas, concorrentes, oportunidades |
| 05 | [Próximas Ações](05-proximas-acoes.md) | Playbook operacional de execução |
| 06 | [Pipeline de Produto](06-pipeline-produto.md) | PRD dos módulos 2-5 do produto |

---

## Pesquisa de mercado

| Doc | Tipo |
|---|---|
| [Pain points WhatsApp Brasil](pesquisa/01-pain-points-whatsapp.md) | Pesquisa qualitativa |
| [Reclame Aqui 2025-2026](pesquisa/02-reclame-aqui.md) | Análise de reclamações reais |
| [Sumário pain points](pesquisa/03-sumario-pain-points.md) | Resumo executivo |
| [Dados tabulares](pesquisa/04-dados-tabulares.md) | Tabelas estruturadas |
| [Fontes e links](pesquisa/05-fontes.md) | Bibliografia |
| [dados-reclame-aqui.csv](pesquisa/dados-reclame-aqui.csv) | Dataset RA raw |

---

## Metodologia que usamos

Cápsula One — framework de empreendedorismo aplicado em todo este material.

Ver [`.claude/skills/capsula-one/`](../../.claude/skills/capsula-one/) — 8 módulos como skills carregáveis pelos agentes.

---

## Material que NÃO está aqui (intencional)

Fica fora do repo (mora em `🚀 Projetos/metodologia/`):

- **MODULO1-8/** — transcrições brutas, PDFs, MP4 do curso (denso, raramente consultado)
- **logs/, scripts/, node_modules/** — infra de processamento
- **README_pesquisa.txt, RESUMO_RAPIDO_pain-points.txt** — duplicatas em .txt
- **materiais/** — aulas processadas (já condensado nas skills `capsula-one/`)

**Princípio:** versionado = consumido com frequência por agentes/humanos. Raw/bruto = referência local.

---

## Como usar com agentes

```typescript
// Agente carrega contexto do produto
Task({
  subagent_type: "cs-product-strategist",
  description: "Validar posicionamento",
  prompt: "Lê docs/strategy/01-conceito.md e docs/strategy/04-mapa-setores.md. Pergunta: qual vertical lançar primeiro dado founder sem capital + parceria com influencer já encaminhada?"
})

// Agente usa metodologia
Task({
  subagent_type: "cs-ux-researcher",
  description: "Roteiro de entrevista",
  prompt: "Aplica .claude/skills/capsula-one/m3-descoberta-cliente.md sobre docs/strategy/01-conceito.md. Cria roteiro de 10 perguntas pra entrevistar influencer fitness com 50k seguidores."
})
```
