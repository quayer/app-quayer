import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { logCleanupAccess } from '@/lib/auth/cleanup-audit-logger'

export default async function RegisterPage() {
  const h = await headers()
  const c = await cookies()
  logCleanupAccess({
    route: '/register',
    method: 'GET',
    userAgent: h.get('user-agent'),
    referrer: h.get('referer'),
    ip: h.get('x-forwarded-for') ?? h.get('x-real-ip'),
    hasAuthCookie: c.has('accessToken'),
  })
  redirect('/signup')
}
