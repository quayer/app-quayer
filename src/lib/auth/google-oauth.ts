export function getGoogleAuthUrl(state?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? ''
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? ''
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    ...(state ? { state } : {}),
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function getGoogleTokens(code: string): Promise<{ access_token: string; id_token: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? '',
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error('Failed to exchange Google code')
  return res.json()
}

export async function getGoogleUserInfo(accessToken: string): Promise<{ sub: string; email: string; name: string; picture?: string; verified_email?: boolean }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to get Google user info')
  return res.json()
}
