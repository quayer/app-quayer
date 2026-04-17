# Resumo do Ecossistema Quayer Builder

> Versao simplificada do BUILDER_AGENT_ARCHITECTURE.md

---

## Os 2 Mundos da Quayer

```
MUNDO 1: BUILDER (criacao)          MUNDO 2: AGENTE PUBLICADO (producao)
O criador monta o agente     --->   O agente atende clientes 24/7 no WhatsApp/IG
```

- **Mundo 1** = onde o dev/agencia/influencer cria e configura o agente usando o Builder AI
- **Mundo 2** = onde o agente ja publicado conversa com usuarios finais no WhatsApp/Instagram

---

## Builder UI - O que e?

O Builder e um **orquestrador leve** (~80 linhas de system prompt) que ajuda o criador a montar um agente de IA por conversa.

O criador diz algo como "cria um agente de vendas de vinho" e o Builder:
1. Detecta a intencao
2. Invoca a **Skill** certa (prompt-engineer, tool-engineer, etc.)
3. Coordena o resultado e devolve pro criador

### 3 Conceitos-chave

| Conceito | O que e | Exemplo |
|----------|---------|---------|
| **Tool** | Acao atomica (chama API, grava no banco) | `create_agent`, `publish_agent` |
| **Skill** | Workflow reutilizavel (orquestra varias tools) | `prompt-engineer`, `deploy-manager` |
| **Sub-agente** | Skill com `context: fork` (roda isolado) | prompt-engineer roda separado e devolve resultado |

---

## Builder Tools (12 ferramentas)

### Tools do Builder (meta-agente - quem CRIA agentes)

| Tool | O que faz |
|------|-----------|
| `create_agent` | Cria um novo agente no banco |
| `update_agent_prompt` | Atualiza o system prompt |
| `attach_tool_to_agent` | Vincula uma ferramenta ao agente |
| `publish_agent` | Publica o agente em producao |
| `get_agent_status` | Consulta status (draft/production/paused) |
| `run_playground_test` | Testa o agente com cenarios simulados |
| `create_custom_tool` | Cria ferramenta customizada via webhook |
| `search_web` | Pesquisa na web (Tavily) |
| `generate_prompt_anatomy` | Gera o prompt do agente com secoes estruturadas |
| `list_whatsapp_instances` | Lista instancias WA disponiveis |
| `create_whatsapp_instance` | Cria nova instancia WA |
| `clone_agent` | (v1.5) Clona agente para outro cliente |

### Tools do Agente Publicado (quem ATENDE clientes)

| Tool | O que faz |
|------|-----------|
| `transfer_to_human` | Transfere pra atendente humano |
| `create_lead` | Registra lead no CRM |
| `create_followup` | Agenda follow-up proativo (BullMQ) |
| `notify_team` | Notifica equipe sem pausar a IA |
| `detect_talking_to_ai` | Detecta "voce e robo?" ou spam/bot |
| `search_contacts` | Busca contatos no CRM |
| `get_session_history` | Recupera historico da sessao |

---

## Skills do Builder

Cada skill e um arquivo `.md` editavel com frontmatter YAML:

| Skill | O que faz | Modo |
|-------|-----------|------|
| **prompt-engineer** | Gera, valida e testa prompts | fork (isolado) |
| **tool-engineer** | Configura ferramentas do agente | fork |
| **deploy-manager** | Publica o agente no WhatsApp | inline |
| **agent-optimizer** | Diagnostica e melhora agente existente | fork |
| **agent-cloner** | Clona agente para outro cliente (v1.5) | fork |

### Pipeline do Prompt Engineer (a skill principal)

```
1. COLETA      --> Criador descreve o que quer (rapido/guiado/misto)
2. GERACAO     --> Monta prompt com secoes visiveis + internas
3. VALIDACAO   --> 4 validadores (anatomia, ambiguidade, blacklist, jornada)
4. CORRECAO    --> Se falhou, corrige automaticamente (max 2x)
5. TESTE       --> Roda 3-5 cenarios simulados (score >= 80?)
6. RETORNO     --> Devolve prompt pronto + score + resumo pro criador
```

---

## Arquitetura de Memoria - 4 Camadas

O agente NUNCA esquece quem e o lead. Funciona assim:

```
Mensagem chega --> PREPARATION AGENT carrega 4 camadas --> injeta no prompt --> IA responde

  Layer 1: ShortMemory   (Redis)     = ultimas N mensagens cruas, TTL 24h
  Layer 2: LongMemory    (Redis)     = resumo consolidado da sessao atual
  Layer 3: SuperLong     (Postgres)  = historico das ultimas 10 sessoes fechadas
  Layer 4: ContactMemory (Postgres)  = facts permanentes do lead (NUNCA expira)
```

### Como cada camada funciona

**ShortMemory** (rapido, efemero)
- Ultimas mensagens cruas guardadas no Redis
- Latencia ~1-5ms
- Limpa quando sessao fecha

**LongMemory** (resumo inteligente)
- A cada ~10 msgs, um LLM barato (haiku/gpt-4o-mini) consolida tudo num resumo
- Extrai **facts** do lead: nome, preferencias, decisoes, restricoes
- Morre quando a sessao fecha (mas facts vao pro ContactMemory)

**SuperLong** (historico cross-sessao)
- Query Postgres das ultimas 10 sessoes finalizadas (30 dias)
- Cache Redis 1h
- Carregado APENAS na 1a mensagem da sessao

**ContactMemory** (permanente)
- JSONB no Postgres com facts acumulados do lead
- Ex: `{ "perfil": "Gabriel, CEO", "preferencia": "nao liga apos 18h" }`
- Alimentado automaticamente pela consolidacao do LongMemory (zero custo extra)
- NUNCA expira

### PREPARATION AGENT

**NAO e um agente LLM.** E uma funcao TypeScript que:
1. Carrega as 4 camadas
2. Injeta tudo no system prompt antes de chamar a IA
3. Zero tokens extras (so Redis GET + SQL)

O prompt do agente fica assim:

```
{system prompt do agente}

## Perfil do Lead        <-- ContactMemory (permanente)
## Historico do Lead     <-- SuperLong (ultimas sessoes)
## Memoria da Sessao     <-- LongMemory (resumo)
[mensagens recentes]     <-- ShortMemory (cruas)
```

---

## Auto-Compact (Context Budget)

Para conversas longas do Builder (20+ turns), o contexto pode estourar.

**Como funciona:**
1. Antes de enviar ao LLM, estima tokens do historico (chars / 4)
2. Se passou 80% do limite (~128k tokens) --> compacta
3. LLM sumariza mensagens antigas em ~500 palavras
4. Mantem ultimas 5 mensagens intactas + summary
5. Se falha 3x seguidas --> circuit breaker (para de tentar)

```
ANTES:  [msg1][msg2]...[msg50] = 130k tokens (estourou!)
DEPOIS: [summary de msg1-msg45] + [msg46][msg47][msg48][msg49][msg50] = ~30k tokens
```

---

## Pipeline de Mensagens (Producao)

### Entrada (process-message) - 12 passos

```
WhatsApp/IG --> webhook --> parse formato --> echo check --> typing
  --> org upsert --> contact upsert --> session upsert --> message insert
  --> whisper (audio) --> vision (img/PDF) --> language detect
  --> buffer Redis (concatena msgs rapidas) --> history fetch
  --> AI Agent
```

### Saida (process-callback) - 10 passos

```
AI responde com Format Tags --> extract output --> normaliza bold
  --> calcula custo (tiktoken) --> check vazio --> split mensagem (800 chars)
  --> extrai tags [buttons], [list], [image] --> TTS (se habilitado)
  --> typing --> roteia para canal (UAZAPI/Chatwoot/Meta) --> marca echo Redis
  --> salva mensagem + custos
```

---

## Canais Suportados

| Canal | Metodo | Notas |
|-------|--------|-------|
| WhatsApp nao-oficial | UAZAPI / Evolution | Botoes reais, carousel nativo |
| WhatsApp oficial | Meta Cloud API | Tudo: Flows, Templates, botoes |
| Instagram | Via Chatwoot (v1) | Ponte via Chatwoot |
| WebWidget | Via Chatwoot | Chat no site |

---

## Modelo de Negocio

```
CAMADA 1 - Criador paga pra CRIAR:
  Dev       = R$ 197/mes (Maker)
  Agencia   = R$ 1.497/mes (Agency)
  Influencer = R$ 497/mes (Studio)

CAMADA 2 - Usuario final paga pra USAR (v2+):
  Audiencia do influencer = R$ 49/mes
  Clientes da agencia     = R$ X/mes
  Quayer cobra 20% de fee no marketplace
```

---

## Padroes de Referencia

6 padroes adotados do Claude Code:
1. **buildTool factory** - defaults seguros (fail-closed)
2. **Particionamento concurrent/serial** - tools read-only em paralelo, write serial
3. **Skill loader com frontmatter** - skills editaveis sem redeploy
4. **Auto-compact com circuit breaker** - compacta contexto longo
5. **Validadores como funcoes puras** - regex/heuristica, sem LLM
6. **Tool metadata** - cada tool declara se e readOnly ou write

5 padroes adotados do OpenClaw:
1. **Memory Dreaming** - dedup de facts a cada 6h
2. **Inbound Debounce** - buffer por canal (WA 5s, IG 7s)
3. **Model Fallback** - se modelo falha, tenta outro
4. **Context Window Guard** - piso minimo de tokens
5. **Follow-up Engine** - 3 triggers de reengajamento
