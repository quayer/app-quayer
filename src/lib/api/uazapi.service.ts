interface UazapiResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// Resolução em cadeia: nome canônico (UAZAPI_*) tem precedência;
// nomes intermediário (UAZAPI_URL) e legado (UAZ_API_*) ficam como fallback
// para não quebrar dev local nem ambientes que ainda não migraram.
function getAdminToken(): string | undefined {
  return process.env.UAZAPI_ADMIN_TOKEN ?? process.env.UAZ_API_KEY
}

function getBaseUrl(): string {
  return (
    process.env.UAZAPI_BASE_URL ??
    process.env.UAZAPI_URL ??
    process.env.UAZ_API_URL ??
    'https://api.uazapi.com'
  )
}

export const uazapiService = {
  async createInstance(name: string): Promise<UazapiResult<{ token: string; instance?: { id: string } }>> {
    const apiKey = getAdminToken()
    const baseUrl = getBaseUrl()
    if (!apiKey) return { success: false, error: 'UAZAPI_ADMIN_TOKEN not configured' }

    try {
      const res = await fetch(`${baseUrl}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ instanceName: name }),
      })
      const data = await res.json()
      return { success: res.ok, data, error: res.ok ? undefined : data?.message }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  async generateQR(token: string): Promise<UazapiResult<{ qrcode: string }>> {
    const baseUrl = getBaseUrl()
    try {
      const res = await fetch(`${baseUrl}/instance/connect`, {
        method: 'GET',
        headers: { apikey: token },
      })
      const data = await res.json()
      return { success: res.ok, data, error: res.ok ? undefined : data?.message }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
}
