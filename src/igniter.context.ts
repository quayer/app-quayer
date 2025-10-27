import { database } from "@/services/database"

/**
 * @description Extended context type with user information
 */
export interface UserContext {
  id: string
  email: string
  name: string
  role: string
  organizationId?: string
}

/**
 * @description Create the context of the Igniter.js application
 * @see https://github.com/felipebarcelospro/igniter-js
 */
export const createIgniterAppContext = () => {
  return {
    services: {
      database,
    },
    db: database, // Alias para compatibilidade
    user: null as UserContext | null, // Será preenchido pelo authProcedure
  }
}

/**
 * @description The context of the Igniter.js application
 * @see https://github.com/felipebarcelospro/igniter-js
 */
export type IgniterAppContext = Awaited<ReturnType<typeof createIgniterAppContext>>
