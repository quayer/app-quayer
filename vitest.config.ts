import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Root Vitest config for the unit-test layer (US-102).
 *
 * Two projects are declared so we can pin a different DOM environment to
 * React component tests without leaking happy-dom into pure backend tests:
 *   - "node"  -> backend / lib / utility tests under test/unit/**\/*.test.ts
 *   - "react" -> component tests under test/unit/react/**\/*.test.tsx
 *
 * Coverage is opt-in. Globals are off; tests must import from 'vitest'.
 * Other test layers (api, e2e, integration) have their own configs and are
 * intentionally not referenced here.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    globals: false,
    setupFiles: ['./test/setup.ts'],
    coverage: {
      enabled: false,
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/node_modules/**', 'src/igniter.client.ts']
    },
    projects: [
      {
        plugins: [],
        resolve: {
          alias: {
            '@': path.resolve(__dirname, './src')
          }
        },
        test: {
          name: 'node',
          environment: 'node',
          globals: false,
          setupFiles: ['./test/setup.ts'],
          include: ['test/unit/**/*.test.ts'],
          exclude: ['test/unit/react/**']
        }
      },
      {
        plugins: [react()] as any,
        resolve: {
          alias: {
            '@': path.resolve(__dirname, './src')
          }
        },
        test: {
          name: 'react',
          environment: 'happy-dom',
          globals: false,
          setupFiles: ['./test/setup.ts'],
          include: ['test/unit/react/**/*.test.tsx']
        }
      }
    ]
  }
})
