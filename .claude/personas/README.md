# Personas & Agents — Quayer

> **Mapa de "quem chamo pra cada problema".**
> Mínimo viável: usa o que já existe no Claude Code + adiciona só o que falta.

---

## Regra de ouro

1. **Tem agent pronto?** Usa (não recria).
2. **Não tem?** Cria em `characters/` (clone de voz) ou `functional/` (output-driven).
3. **Workflow composto?** Cria em `playbooks/`.

---

## Agents prontos no Claude Code (já instalados)

### Estratégia / C-Level
| Quando | Agent | Como chamar |
|---|---|---|
| Decisão estratégica, board, investidores | `cs-ceo-advisor` | `Task(subagent_type: "cs-ceo-advisor")` |
| Decisão técnica, stack, arquitetura | `Startup CTO` ou `cs-cto-advisor` | `Task(subagent_type: "Startup CTO")` |
| Founder solo, decisão multidisciplinar | `Solo Founder` | `Task(subagent_type: "Solo Founder")` |
| Finanças, fundraising, unit economics | `Finance Lead` ou `cs-financial-analyst` | `Task(subagent_type: "Finance Lead")` |

### Produto
| Quando | Agent |
|---|---|
| Priorização, RICE, roadmap | `cs-product-manager` |
| Visão de produto, OKR, pivot | `cs-product-strategist` |
| KPI, dashboard, A/B test | `cs-product-analyst` |
| Discovery, persona, jornada | `cs-ux-researcher` |
| Sprint, story INVEST | `cs-agile-product-owner` |
| Sizing de mercado, TAM/SAM/SOM | `startup-analyst` |

### Engenharia
| Quando | Agent |
|---|---|
| Coordenar time técnico, incidente | `cs-engineering-lead` |
| Arquitetura, code review, CI/CD | `cs-senior-engineer` |
| Sprint, Jira, ceremonies | `cs-project-manager` |

### Marketing / Growth
| Quando | Agent |
|---|---|
| Conteúdo, blog, social | `cs-content-creator` ou `Content Strategist` |
| Aquisição, funil, conversão | `cs-demand-gen-specialist` ou `Growth Marketer` |
| Pipeline, churn, expansão | `cs-growth-strategist` |

### Apoio
| Quando | Agent |
|---|---|
| Google Workspace, automação admin | `cs-workspace-admin` |
| Qualidade, regulatório, auditoria | `cs-quality-regulatory` |

---

## O que ainda NÃO tem (criar sob demanda)

### `characters/` — clones de voz (não existem como agent)
- [ ] `alex-hormozi.md` — ofertas, pricing, Grand Slam Offer
- [ ] `russell-brunson.md` — funis, value ladder, perfect webinar
- [ ] `april-dunford.md` — posicionamento competitivo
- [ ] `seth-godin.md` — marketing de permissão, narrativa
- [ ] `gabriel.md` — seu próprio clone (voz pra parceria com influencer em escala)

### `playbooks/` — workflows compostos (combinam agents)
- [ ] `lancamento-produto.md` — discovery → posicionamento → copy → funil
- [ ] `pitch-parceria-influencer.md` — pesquisa → narrativa → proposta
- [ ] `pagina-de-venda-vertical.md` — ICP → ângulo → copy → CTAs

---

## Como invocar

```typescript
// Agent pronto + contexto Quayer
Task({
  subagent_type: "cs-ceo-advisor",
  description: "Validar decisão de pivot",
  prompt: "Lê docs/strategy/01-conceito.md e docs/strategy/02-modelo-negocio.md. Pergunta: vale pivotar de Agency Vertical pra Vertical AI agora ou esperar primeiros 5 clientes pagantes?"
})

// Agent + skill Cápsula One + contexto Quayer
Task({
  subagent_type: "cs-product-manager",
  description: "Aplicar JTBD",
  prompt: "Carrega .claude/skills/capsula-one/m3-descoberta-cliente.md. Aplica JTBD sobre docs/strategy/01-conceito.md. Identifica 3 jobs concorrentes."
})

// Clone de voz (depois de criar)
Task({
  subagent_type: "general-purpose",
  description: "Reescrever oferta no estilo Hormozi",
  prompt: "Lê .claude/personas/characters/alex-hormozi.md e docs/strategy/02-modelo-negocio.md. Reescreve a oferta Starter aplicando Grand Slam Offer."
})
```

---

## Próximo passo prático

Quando precisar lançar algo, criar **um** playbook (não vários) e ir compondo agents. Começar pequeno: 1 playbook → testar → ajustar → próximo.

**Não criar agents/personas em batch.** Cria quando o problema chega.
