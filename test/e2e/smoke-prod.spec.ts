import { test, expect } from '@playwright/test'

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
    const res = await request.get('/signup')
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain('<form')
  })

  test('api health', async ({ request }) => {
    const res = await request.get('/api/v1/health')
    expect(res.status()).toBe(200)
  })

  test('security headers on login', async ({ request }) => {
    const res = await request.get('/login')
    const headers = res.headers()
    expect(headers['strict-transport-security']).toBeDefined()
  })
})
