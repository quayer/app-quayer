import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Test Configuration
 * Tests all user interactions and frontend functionality
 */
export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  timeout: 120000,

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Block SSE endpoint to prevent networkidle timeout
    extraHTTPHeaders: {
      'X-Test-Mode': 'true',
    },
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
