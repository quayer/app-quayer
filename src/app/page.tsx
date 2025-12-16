import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

// Force dynamic rendering - uses cookies()
export const dynamic = 'force-dynamic'

/**
 * Root Page - Server Component
 * Redirects based on authentication status
 */
export default async function RootPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')

  if (token) {
    redirect('/integracoes')
  } else {
    redirect('/login')
  }
}
