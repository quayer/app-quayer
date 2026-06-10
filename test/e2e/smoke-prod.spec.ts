import { test, expect } from '@playwright/test'

// Homol roda com SIGNUP_ENABLED=false (config intencional do ambiente) — a página
// de signup não renderiza form lá. O workflow smoke-homol seta E2E_SIGNUP_ENABLED=false;
// local/prod (signup aberto) não setam nada e continuam validando o form.
const SIGNUP_DISABLED = process.env.E2E_SIGNUP_ENABLED === 'false'

test.describe('production smoke (read-only)', () => {
  test('home returns 200', async ({ request }) => {
    const res = await request.get('/')
    expect(res.status()).toBe(200)
  })

  test('login page has form', async ({ request }) => {
    const res = await request.get('/login')
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain('<form')
  })

  test('signup page has form', async ({ request }) => {
    test.skip(SIGNUP_DISABLED, 'signup desabilitado neste ambiente (SIGNUP_ENABLED=false)')
    const res = await request.get('/signup')
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain('<form')
  })

  test('api health', async ({ request }) => {
    // O health vive em /api/health (fora do catch-all Igniter /api/v1).
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
  })

  test('security headers on login', async ({ request }) => {
    const res = await request.get('/login')
    const headers = res.headers()
    expect(headers['strict-transport-security']).toBeDefined()
  })
})
