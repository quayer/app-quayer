---
Criado: 2026-06-03
Atualizado: 2026-06-03
Revisar em: ao subir o proxy em homol (validar passthrough + prompt cache)
Relacionados:
  - src/server/ai-module/ai-agents/services/provider-factory.ts
  - docs/infra/SECRETS.md
  - .env.example
---

# LiteLLM proxy — gateway de LLM da Quayer

Roteia **todo** o tráfego de LLM (chat do projeto/meta-agente **e** agente
publicado no WhatsApp — ambos via `getModel` em `provider-factory.ts`) por um
proxy único: custo, observabilidade, fallback e rate-limit centralizados.

## Como liga/desliga
A migração é **env-gated** no `provider-factory.ts`:
- `LITELLM_URL` + `LITELLM_MASTER_KEY` setados → **tudo passa pelo proxy**.
- Vazios → caminho direto por provedor (comportamento anterior). Nada quebra.

Roteamento **por provider** (de propósito): Anthropic continua via `createAnthropic`
apontando para `…/anthropic/v1`, preservando o **prompt caching ephemeral**
(70–90% de economia). OpenAI/OpenRouter vão por `…/v1`.

## Subir local
```bash
# .env precisa de ANTHROPIC_API_KEY, OPENAI_API_KEY e LITELLM_MASTER_KEY
docker compose -f infra/litellm/docker-compose.yml up -d
# aponte a app:
#   LITELLM_URL=http://localhost:4000
#   LITELLM_MASTER_KEY=<mesma do compose>
```

## ✅ Checklist de validação (fazer com o proxy NO AR)
1. `curl $LITELLM_URL/health/liveliness` → ok.
2. Chat do projeto responde (meta-agente) com `LITELLM_URL` setado.
3. Agente WhatsApp responde via webhook.
4. **Prompt cache Anthropic preservado**: 2 turnos seguidos → conferir
   `cache_read`/`cache_creation` na usage (senão custo 5–10×; reavaliar o path
   `/anthropic/v1`). Este é o item que SÓ valida com o proxy rodando.
5. p95 do agente não degradou > 20% vs `docs/infra/BASELINES.md` (1 hop extra).

## Pendências (Wave 6.5)
- Aposentar `retry-with-fallback`/`PROVIDER_COOLDOWNS`/`COST_TABLE` do app em
  favor de fallbacks/cost nativos do LiteLLM (manter atrás de flag até paridade).
- BYOK por org via **virtual keys** do LiteLLM.
- Confirmar sufixos de baseURL (`/anthropic/v1`, `/v1`) contra a versão do proxy.
