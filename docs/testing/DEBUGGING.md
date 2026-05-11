# Debugging Tests — Onde estão os logs e artefatos

> Resposta direta à pergunta "se um teste pegar um bug, onde olho para corrigir?".

Cada camada da pipeline grava artefatos persistentes em `test-results/`. Você nunca precisa rodar o teste de novo só para investigar — todo bug deixa rastro reproduzível.

---

## Mapa de artefatos por camada

```
test-results/
├── vitest-unit.json                    # C2 + C3 — resultados unit (sucesso/falha por teste)
├── vitest-integration.json             # C4 — resultados API integration
├── vitest-contract.json                # Contract tests
├── coverage/                           # Cobertura (quando rodado com --coverage)
│   └── lcov.info, index.html
├── playwright.json                     # C5 — resumo de E2E
├── playwright-junit.xml                # JUnit (consumido pelo GitHub Actions)
├── html/                               # HTML report Playwright (browser interativo)
│   └── index.html  → npx playwright show-report test-results/html
└── playwright/                         # Por teste: trace, screenshot, video
    └── {project}-{spec}-{title}/
        ├── trace.zip                   # Trace completo (rede + DOM + console + ações)
        ├── test-failed-1.png           # Screenshot no momento da falha
        └── video.webm                  # Vídeo da execução
tmp/test-inbox/                         # Emails "enviados" pelo MockEmailProvider
└── 2026-05-10T18-53-26-123Z-user@test.local.json
```

`test-results/` e `tmp/test-inbox/` estão no `.gitignore`. Não commitam, ficam locais.

---

## Por bug, qual artefato consultar

| Tipo de bug | Camada | Artefato | Comando |
|---|---|---|---|
| Lógica pura (OTP, JWT, Zod) errando | C2 | `vitest-unit.json` + console output | `npm run test:unit` (re-roda só esse teste) |
| Componente React renderizando errado | C3 | `vitest-unit.json` + HTML do DOM no stderr | `npm run test:react -- <pattern>` |
| Endpoint retornando 500 / shape errado | C4 | `vitest-integration.json` + log do Postgres test container | `npm run test:api -- <pattern>` |
| Email não chegou / OTP não confere | C4 ou C5 | `tmp/test-inbox/*.json` (1 arquivo por email) | `cat tmp/test-inbox/*.json` |
| Magic link clicado e nada acontece | C5 | Trace Playwright | `npx playwright show-trace test-results/playwright/.../trace.zip` |
| Botão não clicável / form não submete | C5 | Screenshot + video | abrir `test-results/playwright/<spec>/test-failed-1.png` |
| Chamada para Google OAuth com payload errado | C2/C4 | `getUazapiSends()` / interceptor MSW + JSON do teste | adicionar `console.log(server.events())` no debug |
| WhatsApp não envia para uazapi | C2/C4 | `getUazapiSends()` (test/mocks/server.ts) | inspecionar array no teste |

---

## Inbox de emails (MockEmailProvider on-disk)

Toda vez que o backend chama `emailService.sendXxx` em ambiente sem SMTP (default em dev e teste), o conteúdo é gravado em `tmp/test-inbox/{ISO}-{recipient}.json`.

### Helper de leitura

```typescript
import {
  latestForRecipient,
  extractOtp,
  extractMagicLink,
  clearInbox,
} from 'test/helpers/inbox'

beforeEach(() => clearInbox())

it('signup magic link arrives and works', async () => {
  await api.auth.signupOTP.mutate({ body: { email: 'new@test.local', name: 'Alice' } })

  const email = await latestForRecipient('new@test.local')
  expect(email.subject).toMatch(/bem-vindo/i)

  const code = extractOtp(email.html)         // 6 digits
  const link = extractMagicLink(email.html)   // /signup/verify-magic?token=...
})
```

### Inspeção manual

```bash
# último email enviado para um usuário
ls -t tmp/test-inbox/ | head -1 | xargs -I {} cat tmp/test-inbox/{}

# todos os emails enviados durante a sessão
ls tmp/test-inbox/
```

A inbox **não é limpa automaticamente** entre processos. Cada teste que se importa com o conteúdo deve chamar `clearInbox()` no `beforeEach`. Em CI, a inbox vira artifact do GitHub Actions (configurável em `.github/workflows/ci.yml`).

---

## MSW (mocks de Google OAuth e uazapi)

Em testes de integração (C4), os endpoints externos NÃO são chamados. O `test/mocks/server.ts` intercepta:

- `POST https://oauth2.googleapis.com/token`
- `GET https://www.googleapis.com/oauth2/v3/userinfo`
- `POST {UAZAPI_URL}/message/sendText/{instanceId}`

Setup já está em `vitest.config.integration.ts` (`setupFiles: ['./test/mocks/setup-integration.ts']`). `onUnhandledRequest: 'error'` garante que se algum código tentar chamar um endpoint externo não-mockado, o teste falha **com a URL exata** — você sabe na hora que precisa adicionar handler.

### Customizar resposta por teste

```typescript
import { setGoogleProfile, setGoogleTokenFailure } from 'test/mocks/server'

it('cria User a partir do perfil Google', async () => {
  setGoogleProfile({ email: 'carlos@partner.com', name: 'Carlos' })
  // ... callback handler ...
})

it('retorna 400 se Google rejeita o code', async () => {
  setGoogleTokenFailure(400, { error: 'invalid_grant' })
  // ...
})
```

### Inspecionar o que foi "enviado" para uazapi

```typescript
import { getUazapiSends, resetUazapiMocks } from 'test/mocks/server'

it('envia OTP por WhatsApp com número e código corretos', async () => {
  await api.auth.loginOTPPhone.mutate({ body: { phone: '+5511999998888' } })

  const sends = getUazapiSends()
  expect(sends).toHaveLength(1)
  expect(sends[0].number).toBe('5511999998888')
  expect(sends[0].text).toMatch(/\d{6}/)
})
```

---

## Playwright trace (debug C5 sem re-rodar)

O trace é o ouro do debug de E2E. Configurado em `playwright.config.ts` como `trace: 'retain-on-failure'`. Quando um spec falha, abrir:

```bash
npx playwright show-trace test-results/playwright/<spec>-<test>/trace.zip
```

A UI abre num browser local mostrando:
- Linha do tempo de cada `await page.click()` etc.
- DOM snapshot ANTES e DEPOIS de cada ação
- Console e network completos
- Screenshot de cada step
- Source map para o teste

Para inspecionar um teste que passou (debugging de flake), rode local com `--trace on`:

```bash
npx playwright test test/e2e/auth/login-otp-happy-path.spec.ts --trace on
```

---

## CI: persistência dos artefatos

Workflow `.github/workflows/ci.yml` deve subir `test-results/` e `tmp/test-inbox/` como artifact em caso de falha. Sugestão:

```yaml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: test-artifacts-${{ github.run_id }}
    path: |
      test-results/
      tmp/test-inbox/
    retention-days: 14
```

Quando uma PR falha, o artifact fica disponível por 14 dias no run do GitHub Actions, e você pode reproduzir localmente baixando o ZIP.

---

## Smoke check pós-mudança

Depois de qualquer mudança em config de teste, validar com:

```bash
npm run test:unit                # deve continuar verde
ls test-results/vitest-unit.json # deve ter sido criado
ls tmp/test-inbox/ 2>/dev/null   # vazio inicialmente; criado quando MockEmailProvider rodar
```

---

## Regras

- `test-results/` é regerado a cada run — não editar, não commitar
- `tmp/test-inbox/` é local-only — não commitar
- Trace Playwright contém **payloads reais** dos requests — não anexar em ticket público se contém PII
- Coverage report (`test-results/coverage/`) só é gerado se rodar com `--coverage` — não ativar em watch mode (lento)
