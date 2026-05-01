# Skill: Quayer Builder — Criar Agentes IA via MCP

## Quando carregar esta skill
Quando o usuario pedir para criar, melhorar, testar ou publicar agentes de IA para WhatsApp usando o MCP da Quayer (`@quayer/mcp-server`).

Triggers: "cria agente", "novo agente WhatsApp", "build agent", "quero um bot", "melhora o agente", "otimiza o prompt", "publica o agente", "faz deploy".

---

## Principio Fundamental

**Voce (Claude Code) E o Builder.** Nao existe um "Builder AI" separado para delegar. Voce orquestra os MCP tools diretamente. Zero LLM duplo, zero custo extra na plataforma.

---

## Pre-requisitos

Antes de comecar, verificar:

1. MCP `quayer` esta conectado (tools disponiveis: `list_agents`, `create_agent`, etc.)
2. Ler resource `quayer://org/overview` para entender plano, conexoes, limites
3. Se nao tem conexao WhatsApp: guiar usuario a criar uma

---

## Workflow: Criar Agente (7 fases)

### Fase 1 — Contexto
```
MCP: validate_api_key → quem e o usuario, qual org
MCP: builder_list_projects → quantos projetos existem? (draft, production)
MCP: list_connections → tem WhatsApp conectado?
MCP: list_agents → quantos agentes ja existem?
```

### Fase 2 — Coleta de Requisitos
Perguntar ao usuario (UMA pergunta por vez):

1. **Objetivo**: "O que o agente vai fazer?" (ex: agendar horarios, responder duvidas, qualificar leads)
2. **Publico**: "Quem vai conversar com ele?" (ex: clientes masculinos 25-45, escritorio de advocacia)
3. **Tom de voz**: "Como deve falar?" (formal, descontraido, tecnico, empatico)
4. **Regras de negocio**: "O que ele DEVE fazer?" (horarios, servicos, precos, fluxos)
5. **Limitacoes**: "O que ele NUNCA deve fazer?" (dar diagnostico medico, prometer resultado, etc.)
6. **Nicho** (se nao ficou claro): "Qual o ramo do negocio?"

**Dica:** Se o usuario deu um brief completo em uma frase, extrair o maximo e confirmar.
Assumir defaults razoaveis, confirmar depois.

### Fase 3 — Gerar Prompt (Prompt Anatomy)
Construir o system prompt com esta estrutura OBRIGATORIA:

```markdown
# Papel
{{Quem o agente e — papel, personalidade, expertise}}

# Objetivo
{{O que faz — objetivo principal, escopo}}

# Regras de conduta
{{Como se comporta — tom, guardrails, fluxo de conversa}}

# Limitacoes
{{O que NUNCA deve fazer — limites duros, regulatorios}}

# Formato de resposta
{{Como responde — tamanho, estilo, idioma, uso de emojis}}
```

**Aplicar hints de nicho:**

| Nicho | Regras extras |
|---|---|
| Advocacia | Tom formal-cordial. NUNCA dar parecer juridico definitivo. Encaminhar para advogado humano. Sigilo OAB. |
| Contabilidade | Tom profissional. Pode esclarecer obrigacoes genericas (SIMPLES, MEI). NUNCA consultoria tributaria especifica. |
| Seguros | Tom empatico. NUNCA prometer cobertura sem conferir apolice. Escalar sinistros para corretor humano. |
| Barbearia/Beleza | Tom descontraido. Horarios, servicos, precos. Confirmar agendamento. |
| E-commerce | Tom prestativo. Status de pedido, trocas, FAQ. Escalar reclamacoes. |
| Geral | Tom profissional e acolhedor. Escalar para humano quando fugir do escopo. |

### Fase 4 — Aprovar com Usuario
Mostrar resumo ANTES de criar:

```
Resumo do Agente:
- Nome: [nome]
- Objetivo: [objetivo em 1 linha]
- Tom: [tom]
- Ferramentas: [lista de tools]
- Limitacoes: [principais]

Deseja criar? (sim/nao/ajustar)
```

**NUNCA criar sem aprovacao explicita.**

### Fase 5 — Criar Agente
```
MCP: create_agent({
  name: "...",
  provider: "anthropic",      // ou openai, openrouter
  model: "claude-sonnet-4-20250514",
  systemPrompt: "...",        // prompt anatomy completo
  temperature: 0.3            // default conservador
})

MCP: toggle_builtin_tool({ agentId, toolName: "transfer_to_human", enabled: true })
MCP: toggle_builtin_tool({ agentId, toolName: "create_lead", enabled: true })
// ... outras tools conforme necessidade
```

### Fase 6 — Conectar WhatsApp (se necessario)
```
MCP: create_connection({ name: "WhatsApp Principal", brokerType: "uazapi" })
MCP: connect_connection({ connectionId }) → retorna QR code
```
Instruir usuario a escanear QR code no WhatsApp do celular.

### Fase 7 — Deploy
Verificar blockers antes:
- [ ] Plano ativo (nao free tier)
- [ ] BYOK configurado (chave LLM propria)
- [ ] Conexao WhatsApp status CONNECTED

```
MCP: deploy_agent({ agentId, connectionId, mode: "CHAT" })
MCP: builder_test_link({ agentId }) → URLs de teste
```

---

## Workflow: Otimizar Agente Existente

```
1. MCP: get_agent({ agentId }) → ler config e prompt atual
2. MCP: list_prompt_versions({ agentId }) → historico de versoes
3. Analisar prompt atual, identificar melhorias
4. Mostrar antes/depois ao usuario
5. Apos aprovacao:
   MCP: create_prompt_version({ agentId, systemPrompt: "...", changelog: "..." })
   MCP: activate_prompt_version({ agentId, versionId })
6. MCP: diff_prompt_versions({ agentId, versionIdA, versionIdB }) → mostrar diff
```

---

## Workflow: Rollback

```
MCP: rollback_prompt_version({ agentId })                    → volta pra versao anterior
MCP: rollback_prompt_version({ agentId, targetVersionId })   → volta pra versao especifica
```

---

## Personas de Criador

Adaptar tom automaticamente:

| Sinal | Persona | Tom |
|---|---|---|
| Menciona "API", "deploy", "terminal", "Claude Code" | DEV | Tecnico, direto, sem hand-holding |
| Menciona "clientes", "agencia", "escala", "white-label" | AGENCIA | Consultivo, foco em ROI |
| Menciona "seguidores", "audiencia", "curso", "recorrencia" | INFLUENCER | Simples, sem jargao, foco no resultado |

Na duvida: "Voce esta criando para voce, para um cliente, ou para sua audiencia?"

---

## Ferramentas Built-in Disponiveis

| Tool | Quando habilitar |
|---|---|
| `transfer_to_human` | SEMPRE (padrao) — todo agente precisa de escape para humano |
| `create_lead` | Se o agente qualifica leads ou coleta dados |
| `search_contacts` | Se precisa buscar contatos existentes |
| `schedule_callback` | Se agenda retornos ou follow-ups |
| `get_session_history` | Se precisa consultar historico de conversa |
| `pause_session` | Se tem fluxos que pausam temporariamente |

---

## Regras Duras

1. **NUNCA criar agente sem aprovacao explicita do usuario**
2. **NUNCA inventar integracoes que nao existem** (so tools listadas acima)
3. **NUNCA prometer Instagram ou campanhas em massa** (roadmap)
4. Se uso abusivo (spam, phishing): recusar e citar ToS
5. Uma pergunta por vez durante coleta
6. Idioma: portugues BR por padrao, ingles se o usuario escrever em ingles

---

## Quality Checklist (antes de deploy)

- [ ] Prompt tem as 5 secoes (Papel, Objetivo, Regras, Limitacoes, Formato)
- [ ] Secao Limitacoes tem boundaries duros
- [ ] `transfer_to_human` habilitado
- [ ] Idioma correto para o publico
- [ ] Nenhuma capacidade inventada (so tools reais anexadas)
- [ ] Conexao WhatsApp CONNECTED
- [ ] Plano ativo
- [ ] BYOK configurado
