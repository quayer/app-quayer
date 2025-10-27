import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()] as any,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    environment: 'happy-dom',
    setupFiles: './test/setup.ts',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/node_modules/**',
        'src/igniter.client.ts',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/test/**',
        '**/dist/**',
        '**/.next/**'
      ],
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      all: true,
      lines: 70,
      functions: 70,
      branches: 70,
      statements: 70
    },
    globals: true,
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    testTimeout: 10000,
    hookTimeout: 10000,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4
      }
    }
  }
})
