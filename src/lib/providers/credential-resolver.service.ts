export interface ResolvedCredentials {
  provider: string
  credentials: {
    apiKey?: string
    model?: string
  }
}

interface ResolveContext {
  organizationId: string
  projectId?: string
}

export const credentialResolver = {
  async resolve(type: string, provider: string, context: ResolveContext): Promise<ResolvedCredentials | null> {
    return {
      provider,
      credentials: {
        apiKey: process.env.ANTHROPIC_API_KEY,
      },
    }
  },
}
