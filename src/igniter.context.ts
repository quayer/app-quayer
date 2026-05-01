import { database } from '@/server/services/database'

export interface UserContext {
  id: string
  email: string
  name: string
  role: string
  organizationId?: string
}

export const createIgniterAppContext = () => ({
  services: { database },
  db: database,
  user: null as UserContext | null,
})

export type IgniterAppContext = Awaited<ReturnType<typeof createIgniterAppContext>>
