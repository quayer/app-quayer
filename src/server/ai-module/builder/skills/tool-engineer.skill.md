---
name: tool-engineer
description: Configura ferramentas oficiais e custom para agentes Quayer
context: inline
when_to_use: >
  Use quando o criador quer integrar com APIs externas, conectar ferramentas,
  ou quando precisa configurar quais tools um agente tera.
  Triggers: "integra com X", "conecta API", "quero que o agente faca Y"
allowed_tools:
  - attach_tool_to_agent
  - create_custom_tool
  - search_web
---

# Skill: Tool Engineer

Pipeline para configurar tools em agentes Quayer: catalogo oficial → cenario
custom (webhook) → retorno para prompt-engineer. Skill prescritiva — siga
contratos e checklists. Builder LLM NAO improvisa URLs, nomes ou shapes.

## 1. Consulta ao Catalogo

Quando o criador solicita uma integracao, o Builder consulta o catalogo de
tools oficiais antes de partir para custom:

### Match oficial (status: available)
- Tool ja existe e esta disponivel.
- Builder usa `attach_tool_to_agent` para vincular a tool ao agente.
- Informa ao criador quais parametros de configuracao sao necessarios
  (ex: API key, webhook URL, credenciais OAuth quando aplicavel).

### Match backlog (status: backlog)
- Tool planejada mas ainda nao disponivel.
- Builder informa a fase prevista (v1.5, v2) e sugere alternativas:
  outra tool oficial equivalente ou cenario custom como workaround.

### Sem match
- Nenhuma tool oficial corresponde a necessidade.
- Builder segue para o cenario custom (secao 2).

## 2. Cenario Custom

Quando nao ha tool oficial, o Builder guia a criacao de uma tool custom
baseada em webhook HTTPS. Use `search_web` para descobrir a documentacao da
API alvo e pergunte ao criador pela URL publica do webhook final.

### 2.1. Contrato obrigatorio para `create_custom_tool`

Todos os campos abaixo precisam estar corretos antes da chamada. Se algum
nao estiver disponivel, pergunte ao criador — nao invente.

| Campo | Obrigatorio | Regra |
|---|---|---|
| `agentId` | sim | UUID do `AIAgentConfig.id` — sempre disponivel no contexto do turno do Builder |
| `name` | sim | `snake_case`, 2-64 chars, regex `^[a-z][a-z0-9_]*$`. Unico por organizacao. Exemplos: `check_inventory`, `send_invoice`, `create_calendar_event` |
| `description` | sim | 10-500 chars. Explica **quando** o agente deve chamar e **qual pergunta do cliente final** isso resolve. Ruim: "Chama API X". Bom: "Consulta estoque de um SKU no Shopify quando cliente pergunta 'tem em estoque?'" |
| `webhookUrl` | sim | HTTPS, porta 443, hostname publico. Bloqueados: `localhost`, `127.*`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`, `.internal`, `.local`, IPv6 loopback/link-local/unique-local. Usar a URL fornecida pelo criador apos confirmacao — NUNCA inventar URL nem usar URL generica de doc |
| `webhookSecret` | nao | Se presente, enviado no header `X-Webhook-Secret` em cada call |
| `parameters` | sim | JSONSchema valido. Shape: `{ type: 'object', properties: { ... }, required: [...] }`. Cada property precisa `type` e `description` |

### 2.2. Runtime constraints

O runtime do agente (executor que chama o webhook em cada turno real do
WhatsApp) garante o seguinte contrato. O criador precisa saber disso ao
desenhar o endpoint do lado dele:

- **Transport**: HTTPS-only, porta 443. Sem HTTP plano. Sem portas custom.
- **Metodo**: `POST` com body JSON. O runtime nao emite GET/PUT/DELETE.
- **Headers**:
  - `Content-Type: application/json`
  - `X-Webhook-Secret: <secret>` quando `webhookSecret` estiver configurado
- **Timeout**: default 10s. Se o endpoint demora mais, o turno falha.
- **Response**: espera JSON. Body maior que 8KB e truncado antes de voltar
  para o LLM.
- **Erros** (4xx, 5xx, timeout, DNS fail, SSRF bloqueado): retornam
  `{ success: false, error, status? }` para o agente. O agente decide como
  explicar o problema ao cliente final (ex: "nao consegui consultar o
  estoque agora, pode tentar em alguns minutos?").
- **Idempotencia**: runtime NAO retenta automaticamente em 5xx. Se o
  endpoint do criador precisar idempotencia, o desenho e responsabilidade
  dele (ex: aceitar `requestId` no body).

### 2.3. Pipeline concreta (seguir em ordem)

Pseudocodigo que o Builder LLM deve seguir. Exemplo: "quero que o agente
consulte estoque no Shopify".

```
1. Usuario pede: "quero que agente consulte estoque no Shopify"

2. search_web("Shopify Admin API product inventory endpoint site:shopify.dev")

3. Ler os 2-3 primeiros resultados. Extrair URL base, metodo, shape de auth.

4. Decidir viabilidade: Quayer so emite POST. Se a API terceira exige GET ou
   header custom (ex: X-Shopify-Access-Token), o criador precisa de proxy:
     a) Cloudflare Worker / Vercel function
     b) n8n / Make / Zapier webhook
     c) Endpoint HTTPS proprio

5. Perguntar ao criador: "Voce tem endpoint HTTPS publico que recebe POST
   com { sku } e devolve JSON com estoque? Se nao, sugiro Cloudflare Worker."

6. Apos URL valida, rodar checklist 2.4 e chamar create_custom_tool (ver
   exemplo 1 na secao 3 para o shape exato do argumento).

7. attach_tool_to_agent({ agentId, toolName: 'check_inventory' })

8. Sinalizar prompt-engineer: adicionar instrucao "Quando cliente perguntar
   estoque, chame check_inventory com o SKU" no system prompt.
```

### 2.4. Checklist antes de chamar `create_custom_tool`

Antes de invocar, valide mentalmente:

- [ ] URL e HTTPS, porta 443, hostname publico (nao localhost, nao RFC1918)?
- [ ] `name` e snake_case, 2-64 chars, comeca com letra minuscula?
- [ ] `name` nao colide com tool ja existente na organizacao?
- [ ] `description` responde "quando chamar" e "o que resolve em linguagem
      de cliente final"?
- [ ] `parameters` tem `type: 'object'`, `properties` e `required`?
- [ ] Cada property em `properties` tem `type` e `description`?
- [ ] Nenhum campo sensivel (senha, API key, token) esta no `parameters`
      schema — segredos vao em `webhookSecret`, nao nos args do turno?
- [ ] O criador confirmou a URL final (nao e URL generica da documentacao)?

Se qualquer item falhar, pause e corrija — nao registre a tool quebrada.

## 3. Exemplos de spec completa

Tres exemplos reais. Cada um contem: pedido do criador em linguagem natural,
spec final em JSON (o argumento de `create_custom_tool`), e a instrucao que
deve ser injetada no system prompt do agente.

### Exemplo 1 — `check_inventory` (Shopify via proxy)

Pedido do criador: "Quero que o agente consiga responder se tem estoque de
um produto. Minha loja e Shopify."

Spec:
```json
{
  "name": "check_inventory",
  "description": "Consulta estoque de um SKU no Shopify. Use quando cliente pergunta 'tem em estoque?', 'ainda tem X?', 'quantos disponiveis?'.",
  "webhookUrl": "https://inventory.loja-abc.com.br/check",
  "parameters": {
    "type": "object",
    "properties": {
      "sku": { "type": "string", "description": "SKU do produto (ex: 'CAM-AZ-M')" }
    },
    "required": ["sku"]
  }
}
```

Frase para system prompt:
> Quando o cliente perguntar sobre disponibilidade de produto, chame
> `check_inventory` passando o SKU. Se nao souber o SKU, peca o nome do
> produto antes.

### Exemplo 2 — `create_calendar_event` (Google Calendar via proxy)

Pedido do criador: "Quero que quando o cliente confirmar o horario, o
agente crie o evento direto no meu Google Calendar."

Spec:
```json
{
  "name": "create_calendar_event",
  "description": "Cria evento no Google Calendar do atendente apos cliente confirmar dia e horario. Use somente apos ter titulo, inicio, fim e email do cliente.",
  "webhookUrl": "https://calendar.agencia-xpto.com/event",
  "parameters": {
    "type": "object",
    "properties": {
      "title": { "type": "string", "description": "Titulo do evento (ex: 'Consulta - Joao')" },
      "startTime": { "type": "string", "description": "Inicio em ISO 8601 com timezone (ex: '2026-05-01T14:00:00-03:00')" },
      "endTime": { "type": "string", "description": "Fim em ISO 8601 com timezone" },
      "attendeeEmail": { "type": "string", "description": "Email do cliente final" }
    },
    "required": ["title", "startTime", "endTime", "attendeeEmail"]
  }
}
```

Frase para system prompt:
> Apos cliente confirmar dia, horario e fornecer email, chame
> `create_calendar_event`. Sempre use ISO 8601 com timezone `-03:00`
> (Brasilia). Se a chamada falhar, peca desculpas e ofereca ligar para
> humano.

### Exemplo 3 — `lookup_customer` (ERP proprio)

Pedido do criador: "Quando o cliente mandar o CPF, quero que puxe o
cadastro no meu sistema."

Spec:
```json
{
  "name": "lookup_customer",
  "description": "Busca cadastro de cliente no ERP interno por CPF. Use quando cliente envia CPF ou quando agente precisa confirmar dados antes de seguir com atendimento.",
  "webhookUrl": "https://erp-api.empresa-xpto.com.br/customers/lookup",
  "parameters": {
    "type": "object",
    "properties": {
      "cpf": { "type": "string", "description": "CPF do cliente, somente digitos (11 chars)" }
    },
    "required": ["cpf"]
  }
}
```

Frase para system prompt:
> Quando o cliente fornecer CPF, chame `lookup_customer` imediatamente.
> Se o retorno for `success: false`, informe que nao encontrou o cadastro
> e ofereca abrir novo.

## 4. Erros comuns (DON'T / DO)

| DON'T | DO |
|---|---|
| `name: "check inventory"` (com espaco) | `name: "check_inventory"` |
| `webhookUrl: "https://shopify.com/api/..."` (URL generica lida na doc) | URL fornecida pelo criador apos confirmacao explicita |
| `webhookUrl: "http://..."` (HTTP plano) | HTTPS obrigatorio |
| `webhookUrl: "https://meu-servidor.internal"` | Hostname publico resolvivel |
| `parameters: { query: "string" }` (shape invalido) | `{ type: 'object', properties: { query: { type: 'string', description: '...' } }, required: ['query'] }` |
| Colocar token/API key em `parameters` | Colocar em `webhookSecret` |
| Inventar URL da API do terceiro | Usar `search_web` + perguntar URL ao criador |
| `description: "Chama API"` | `description: "Consulta estoque quando cliente pergunta 'tem em estoque?'"` |
| Registrar tool e esperar que `attach_tool_to_agent` seja automatico | Chamar `attach_tool_to_agent` explicitamente apos criacao |

## 5. Retorno para Prompt Engineer

Apos tools criadas ou vinculadas:

- Lista todas as tools configuradas no agente com suas descricoes curtas.
- Para cada tool, gera a frase de instrucao de uso (ver exemplos em 3) a
  ser injetada no system prompt.
- Sinaliza ao prompt-engineer skill que o prompt precisa ser atualizado
  com as novas instrucoes de tools.
- Se o agente ja tem um prompt ativo, dispara re-validacao automatica
  (etapa 3 do prompt-engineer) para garantir que o prompt novo referencia
  corretamente as tools recem-adicionadas.
