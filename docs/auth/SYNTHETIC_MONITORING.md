# Synthetic Monitoring — Auth

> Ponto de entrada do time de auth para o monitoramento sintético da Quayer. Este documento lista **apenas** o que o monitor faz (e o que **não** faz) para a superfície de autenticação. A estratégia completa, targets não-auth, runbooks e upgrade path vivem em [`../infra/SYNTHETIC_MONITORING.md`](../infra/SYNTHETIC_MONITORING.md).

---

## O que o monitor verifica hoje para auth

Target: `https://app.quayer.com/login` (nome interno: `prod-login`), executado a cada 5 minutos via GitHub Actions.

Verificações por run:

1. **HTTP status** — a resposta deve ser `200`.
2. **Presença de formulário** — o HTML deve conter um elemento `<form` (asserção via `grep -q "<form"`).
3. **Presença de marca** — o HTML deve conter a substring `quayer` (case-insensitive, asserção via `grep -qi "quayer"`). Isso prova que a resposta é o app Quayer real e não uma página de erro injetada por Cloudflare/WAF.

Qualquer uma das três asserções falhando marca o job como falho e dispara o alerta no Discord (se `DISCORD_WEBHOOK_URL` estiver configurado).

---

## O que o monitor NÃO faz (e não vai fazer)

Estas são restrições invioláveis da política de segurança:

- **Não faz login real.** Nenhuma chamada autenticada, nenhuma sessão criada.
- **Não envia credenciais.** Nenhum email, senha, token ou cookie de sessão é enviado.
- **Não usa OTP fixo.** Não existe conta de teste com OTP hardcoded em lugar nenhum do workflow.
- **Não submete formulário.** Apenas `GET` no HTML público do `/login`.
- **Não escreve no banco.** Nenhum side-effect em produção.

Se você tiver uma necessidade de cobertura sintética que exija qualquer uma dessas ações (ex.: validar o fluxo completo de OTP), **não adicione ao workflow atual** — traga a discussão para o time de segurança antes, porque o caminho correto é Checkly/Playwright em um ambiente de homol dedicado com conta de teste isolada.

---

## Arquivos relevantes

- Workflow: [`.github/workflows/synthetic-monitor.yml`](../../.github/workflows/synthetic-monitor.yml)
- Estratégia completa, targets não-auth, runbooks, upgrade path: [`../infra/SYNTHETIC_MONITORING.md`](../infra/SYNTHETIC_MONITORING.md)

---

## Como adicionar uma nova rota pública de auth ao monitor

1. Abra `.github/workflows/synthetic-monitor.yml`.
2. Adicione uma linha no `matrix.target` com `url`, `expect` e `name`.
3. Se a nova rota também precisa de verificação de HTML (não só status), replique o padrão do step `Verify login HTML contains form and brand`, gated por `if: matrix.target.name == '<novo-nome>'`.
4. Nunca remova as restrições da seção anterior.
