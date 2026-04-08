# E2E Tests — Quayer Testing Pipeline

Testes end-to-end Playwright para a plataforma Quayer.

## Pré-requisitos

1. Servidor de desenvolvimento rodando em `http://localhost:3000`:
   ```bash
   npm run dev
   ```
2. Playwright browsers instalados (rodar uma vez):
   ```bash
   npx playwright install
   ```

> Os scripts `npm run test:e2e` ainda serão consolidados em uma onda futura.
> Por enquanto, use os comandos `npx playwright test` diretamente.

## Como rodar

| Cenário | Comando |
|---|---|
| Local (default — http://localhost:3000) | `npx playwright test --project=local` |
| Homologação (https://homol.quayer.com) | `npx playwright test --project=homol` |
| Smoke em produção (https://app.quayer.com) | `npx playwright test --project=prod` |
| UI mode | `npx playwright test --project=local --ui` |
| Headed (browser visível) | `npx playwright test --project=local --headed` |
| Spec específico | `npx playwright test --project=local admin-security.spec.ts` |

## Por que `prod` tem `testMatch` restrito?

O projeto `prod` aponta para `https://app.quayer.com` (ambiente real, com
usuários reais). Para evitar criar lixo no banco de produção e disparar
side-effects (e-mails, SMS, cobranças), `prod` SÓ roda specs cujo nome
casa com `smoke-prod.spec.ts`. NUNCA executa fluxos completos de login,
signup, criação de organização, etc.

Se você precisar adicionar uma verificação rápida em produção, crie um
arquivo `test/e2e/smoke-prod.spec.ts` com asserts read-only (status 200,
heading correto, sem mutação de dados).

## Como capturar e visualizar trace

Traces ficam em `test-results/` quando um teste falha (config:
`trace: 'on-first-retry'`). Para abrir:

```bash
npx playwright show-trace test-results/<pasta-do-teste>/trace.zip
```

Vídeos (`retain-on-failure`) e screenshots (`only-on-failure`) ficam na
mesma pasta. O relatório HTML completo é gerado em `test-results/html/`:

```bash
npx playwright show-report test-results/html
```

## Como adicionar um novo spec

1. Crie o arquivo em `test/e2e/<nome>.spec.ts` (mesmo diretório).
2. Use o template:
   ```typescript
   import { test, expect } from '@playwright/test';

   test.describe('Minha Feature', () => {
     test('deve fazer X', async ({ page }) => {
       await page.goto('/minha-rota'); // baseURL vem do project
       await expect(page.getByRole('heading', { name: /título/i })).toBeVisible();
     });
   });
   ```
3. Use `page.goto('/rota')` (path relativo) — o `baseURL` é injetado pelo
   `--project`. Assim o mesmo spec roda em local/homol sem alterações.
4. NÃO commite hardcoded `http://localhost:3000` em specs novos.
5. Specs que devem rodar em produção: nomeie como `smoke-prod.spec.ts`.

## Referência

- Skill: `.claude/skills/testing-pipeline.md`
- Playwright docs: https://playwright.dev
- Config: `playwright.config.ts` (raiz do repo)
