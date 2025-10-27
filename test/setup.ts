import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './mocks/server'
import '@testing-library/jest-dom/vitest'

// Configurar MSW para mock de API
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
