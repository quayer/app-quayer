import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Test Configuration — Quayer Testing Pipeline (US-107A)
 *
 * Three projects:
 *   - local: roda contra http://localhost:3000 (servidor local — npm run dev)
 *   - homol: roda contra https://homol.quayer.com
 *   - prod : roda contra https://app.quayer.com — APENAS specs marcadas como
 *            smoke (test/e2e/smoke-prod.spec.ts). NUNCA login/signup completos.
 *
 * O usuário deve rodar `npm run dev` separadamente antes dos testes locais.
 * Não há webServer configurado de propósito — controle explícito do servidor.
 */
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/html' }],
  ],
  outputDir: 'test-results',

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Header usado por rotas de teste (preservado da config anterior)
    extraHTTPHeaders: {
      'X-Test-Mode': 'true',
    },
  },

  projects: [
    {
      name: 'local',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000',
      },
    },
    {
      name: 'homol',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://homol.quayer.com',
      },
    },
    {
      name: 'prod',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://app.quayer.com',
      },
      // Restrição CRÍTICA: prod NUNCA roda login/signup completos.
      // Apenas specs explicitamente marcadas como smoke-prod.
      testMatch: /smoke-prod\.spec\.ts$/,
    },
  ],

  // webServer intencionalmente ausente — usuário roda `npm run dev`
  // separadamente. Ver test/e2e/README.md.
})
