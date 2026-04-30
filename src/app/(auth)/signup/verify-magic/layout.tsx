import { headers, cookies } from 'next/headers'
import { logCleanupAccess } from '@/lib/auth/cleanup-audit-logger'

export default async function SignupVerifyMagicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const h = await headers()
  const c = await cookies()
  logCleanupAccess({
    route: '/signup/verify-magic',
    method: 'GET',
    userAgent: h.get('user-agent'),
    referrer: h.get('referer'),
    ip: h.get('x-forwarded-for') ?? h.get('x-real-ip'),
    hasAuthCookie: c.has('accessToken'),
  })
  return <>{children}</>
}
