import { redirect } from 'next/navigation'

// Redirect to /atendimentos - URL was renamed for better UX
export default function SessionsRedirect() {
  redirect('/atendimentos')
}
