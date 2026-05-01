interface UazapiResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export const uazapiService = {
  async createInstance(name: string): Promise<UazapiResult<{ token: string; instance?: { id: string } }>> {
    const apiKey = process.env.UAZ_API_KEY
    const baseUrl = process.env.UAZ_API_URL ?? 'https://api.uazapi.com'
    if (!apiKey) return { success: false, error: 'UAZ_API_KEY not configured' }

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
    const baseUrl = process.env.UAZ_API_URL ?? 'https://api.uazapi.com'
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
