# Cápsula One — Skills

> Framework de empreendedorismo aplicado ao Quayer.
> 8 módulos + processo geral, condensados em skills carregáveis por agentes.

Material original em `🚀 Projetos/metodologia/skills/` (mantido fora do repo).

---

## Quando carregar cada skill

### Processo geral
| Skill | Quando usar |
|---|---|
| [`00-processo.md`](00-processo.md) | Visão geral do método. Carregar antes de começar fase nova. |

### Módulo 1 — Fundamentos
| Skill | Quando usar |
|---|---|
| [`m1-ecossistema.md`](m1-ecossistema.md) | Mapear ecossistema de startups, players, parceiros |
| [`m1-ideacao.md`](m1-ideacao.md) | Gerar/validar ideias de produto |
| [`m1-time.md`](m1-time.md) | Formação de time empreendedor, complementaridade |

### Módulo 2 — Mercado
| Skill | Quando usar |
|---|---|
| [`m2-segmentacao.md`](m2-segmentacao.md) | Segmentar mercado, escolher beachhead, processo empreendedor |

### Módulo 3 — Cliente
| Skill | Quando usar |
|---|---|
| [`m3-descoberta-cliente.md`](m3-descoberta-cliente.md) | JTBD, jornada do cliente, roteiro de entrevista, dores |

### Módulo 4 — Produto
| Skill | Quando usar |
|---|---|
| [`m4-solucao-produto.md`](m4-solucao-produto.md) | Redefinir problema, MVP, aderência problema-solução |

### Módulo 5 — Receita
| Skill | Quando usar |
|---|---|
| [`m5-modelos-receita.md`](m5-modelos-receita.md) | Proposta de valor quantificada, captura de valor, pricing |

### Módulo 6 — Aquisição
| Skill | Quando usar |
|---|---|
| [`m6-aquisicao-clientes.md`](m6-aquisicao-clientes.md) | Processo de compra, leads, ativação, SPIN, sucesso do cliente |

### Módulo 7 — Métricas
| Skill | Quando usar |
|---|---|
| [`m7-metricas-financeiras.md`](m7-metricas-financeiras.md) | CAC, LTV, cash burn, unit economics |

### Módulo 8 — Captação
| Skill | Quando usar |
|---|---|
| [`m8-captacao-investimento.md`](m8-captacao-investimento.md) | Valuation, pitch deck, mútuo conversível, oratória |

---

## Como invocar com agentes

```typescript
// Agente de produto aplicando JTBD
Task({
  subagent_type: "cs-product-manager",
  description: "Aplicar JTBD na feature X",
  prompt: "Carrega .claude/skills/capsula-one/m3-descoberta-cliente.md. Aplica framework JTBD pra validar se feature [X] resolve um job real. Usa contexto de docs/strategy/01-conceito.md."
})

// Agente financeiro fazendo unit economics
Task({
  subagent_type: "cs-financial-analyst",
  description: "Unit economics Quayer",
  prompt: "Carrega .claude/skills/capsula-one/m7-metricas-financeiras.md. Calcula CAC, LTV, payback para o plano Starter usando docs/strategy/02-modelo-negocio.md."
})

// Agente de pitch
Task({
  subagent_type: "cs-ceo-advisor",
  description: "Estrutura pitch deck",
  prompt: "Carrega .claude/skills/capsula-one/m8-captacao-investimento.md. Estrutura pitch deck Quayer baseado em docs/strategy/03-sumario-executivo.md. 10 slides."
})
```

---

## Princípio

Cada skill é **autocontida** — carrega sozinha sem dependências.
Combina com `docs/strategy/` (contexto Quayer) pra produzir output específico do negócio.
