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
  // FIX: Cookie correto é 'accessToken', não 'auth_token'
  const token = cookieStore.get('accessToken')

  if (token) {
    redirect('/integracoes')
  } else {
    redirect('/login')
  }
}
