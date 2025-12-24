import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Test Configuration
 * Tests all user interactions and frontend functionality
 *
 * AMBIENTES:
 * - Desenvolvimento: http://localhost:3000 (padrao)
 * - Producao: https://app.quayer.com (via BASE_URL env)
 *
 * Exemplo:
 * BASE_URL=https://app.quayer.com npx playwright test --headed
 */
export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Serializado para testes interativos
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
  ],
  timeout: 300000, // 5 minutos para testes interativos
  outputDir: 'test-results',

  use: {
    // PRODUCAO por padrao para testes de auth
    baseURL: process.env.BASE_URL || 'https://app.quayer.com',
    trace: 'on',
    screenshot: 'on',
    video: 'on', // Gravar video de todos os testes
    // Block SSE endpoint to prevent networkidle timeout
    extraHTTPHeaders: {
      'X-Test-Mode': 'true',
    },
    // Viewport desktop
    viewport: { width: 1280, height: 720 },
    // Localizacao Brasil
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Comentado para usar servidor já rodando
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: true,
  //   timeout: 120000,
  // },
})
