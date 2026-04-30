/**
 * Credential Resolver Service
 *
 * Resolve credenciais seguindo hierarquia BYOC:
 * 1. ConnectionSettings (override por instância WhatsApp)
 * 2. BuilderProject override (chave específica do projeto)
 * 3. OrganizationProvider (credencial da organização)
 * 4. SystemDefault (variáveis de ambiente do Quayer)
 */

import { database } from '@/server/services/database';
import type { ProviderCategory, Prisma } from '@prisma/client';

// ==================== TYPES ====================

export interface Credentials {
  apiKey?: string;
  apiSecret?: string;
  apiUrl?: string;
  region?: string;
  bucket?: string;
  projectId?: string;
  [key: string]: string | undefined;
}

export interface ResolvedCredentials {
  credentials: Credentials;
  settings?: Record<string, unknown>;
  source: 'connection' | 'project' | 'organization' | 'system';
  providerId?: string;
  provider: string;
}

export interface ResolveContext {
  organizationId: string;
  connectionId?: string;
  /** BuilderProject ID — when set, project-level keys take precedence over org-level */
  projectId?: string;
}

// ==================== SYSTEM DEFAULTS ====================

const SYSTEM_DEFAULTS: Record<ProviderCategory, Record<string, () => Credentials | null>> = {
  AI: {
    openai: () => process.env.OPENAI_API_KEY ? {
      apiKey: process.env.OPENAI_API_KEY,
      apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
    } : null,
    anthropic: () => process.env.ANTHROPIC_API_KEY ? {
      apiKey: process.env.ANTHROPIC_API_KEY,
    } : null,
    google: () => process.env.GOOGLE_AI_API_KEY ? {
      apiKey: process.env.GOOGLE_AI_API_KEY,
    } : null,
    openrouter: () => process.env.OPENROUTER_API_KEY ? {
      apiKey: process.env.OPENROUTER_API_KEY,
    } : null,
  },
  TRANSCRIPTION: {
    whisper: () => process.env.OPENAI_API_KEY ? {
      apiKey: process.env.OPENAI_API_KEY,
    } : null,
    deepgram: () => process.env.DEEPGRAM_API_KEY ? {
      apiKey: process.env.DEEPGRAM_API_KEY,
    } : null,
    assemblyai: () => process.env.ASSEMBLYAI_API_KEY ? {
      apiKey: process.env.ASSEMBLYAI_API_KEY,
    } : null,
  },
  TTS: {
    elevenlabs: () => process.env.ELEVENLABS_API_KEY ? {
      apiKey: process.env.ELEVENLABS_API_KEY,
    } : null,
    'openai-tts': () => process.env.OPENAI_API_KEY ? {
      apiKey: process.env.OPENAI_API_KEY,
    } : null,
  },
  INFRASTRUCTURE: {
    redis: () => process.env.REDIS_URL ? {
      apiUrl: process.env.REDIS_URL,
    } : null,
    postgresql: () => process.env.DATABASE_URL ? {
      apiUrl: process.env.DATABASE_URL,
    } : null,
    supabase: () => process.env.SUPABASE_URL ? {
      apiUrl: process.env.SUPABASE_URL,
      apiKey: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY,
    } : null,
    s3: () => process.env.AWS_ACCESS_KEY_ID ? {
      apiKey: process.env.AWS_ACCESS_KEY_ID,
      apiSecret: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.AWS_S3_BUCKET,
    } : null,
  },
  AUXILIARY: {
    'google-maps': () => process.env.GOOGLE_MAPS_API_KEY ? {
      apiKey: process.env.GOOGLE_MAPS_API_KEY,
    } : null,
    sendgrid: () => process.env.SENDGRID_API_KEY ? {
      apiKey: process.env.SENDGRID_API_KEY,
    } : null,
    resend: () => process.env.RESEND_API_KEY ? {
      apiKey: process.env.RESEND_API_KEY,
    } : null,
  },
};

// ==================== SERVICE ====================

class CredentialResolverService {
  private cache: Map<string, { data: ResolvedCredentials; expiresAt: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  /**
   * Resolve a credencial a ser usada seguindo hierarquia:
   * 1. ConnectionSettings (override por instância)
   * 2. BuilderProject override (chave específica do projeto)
   * 3. OrganizationProvider (credencial da org)
   * 4. System Default (env vars do Quayer)
   */
  async resolve(
    category: ProviderCategory,
    provider: string,
    context: ResolveContext
  ): Promise<ResolvedCredentials | null> {
    const cacheKey = `${context.organizationId}:${context.connectionId || ''}:${context.projectId || ''}:${category}:${provider}`;

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // 1. Override por instância WhatsApp (ConnectionSettings)
    if (context.connectionId) {
      const connectionCreds = await this.getConnectionCredentials(
        context.connectionId,
        category,
        provider
      );
      if (connectionCreds) {
        this.cache.set(cacheKey, { data: connectionCreds, expiresAt: Date.now() + this.CACHE_TTL });
        return connectionCreds;
      }
    }

    // 2. Override por projeto Builder (builderProjectId set)
    if (context.projectId) {
      const projectProvider = await database.organizationProvider.findFirst({
        where: {
          organizationId: context.organizationId,
          builderProjectId: context.projectId,
          category,
          provider,
          isActive: true,
        },
        orderBy: { priority: 'asc' },
      });

      if (projectProvider) {
        const resolved: ResolvedCredentials = {
          credentials: projectProvider.credentials as Credentials,
          settings: projectProvider.settings as Record<string, unknown> | undefined,
          source: 'project',
          providerId: projectProvider.id,
          provider,
        };
        this.cache.set(cacheKey, { data: resolved, expiresAt: Date.now() + this.CACHE_TTL });
        return resolved;
      }
    }

    // 3. Provedor da organização (builderProjectId IS NULL)
    const orgProvider = await database.organizationProvider.findFirst({
      where: {
        organizationId: context.organizationId,
        builderProjectId: null,
        category,
        provider,
        isActive: true,
      },
      orderBy: { priority: 'asc' },
    });

    if (orgProvider) {
      const resolved: ResolvedCredentials = {
        credentials: orgProvider.credentials as Credentials,
        settings: orgProvider.settings as Record<string, unknown> | undefined,
        source: 'organization',
        providerId: orgProvider.id,
        provider,
      };
      this.cache.set(cacheKey, { data: resolved, expiresAt: Date.now() + this.CACHE_TTL });
      return resolved;
    }

    // 4. Fallback para default do sistema
    const systemDefault = this.getSystemDefault(category, provider);
    if (systemDefault) {
      const resolved: ResolvedCredentials = {
        credentials: systemDefault,
        source: 'system',
        provider,
      };
      this.cache.set(cacheKey, { data: resolved, expiresAt: Date.now() + this.CACHE_TTL });
      return resolved;
    }

    return null;
  }

  /**
   * Resolve com fallback automático — retorna TODOS os provedores ativos em ordem
   */
  async resolveWithFallback(
    category: ProviderCategory,
    context: ResolveContext
  ): Promise<ResolvedCredentials[]> {
    const where: Prisma.OrganizationProviderWhereInput = {
      organizationId: context.organizationId,
      category,
      isActive: true,
      builderProjectId: context.projectId ?? null,
    };

    const providers = await database.organizationProvider.findMany({
      where,
      orderBy: { priority: 'asc' },
    });

    if (providers.length === 0) {
      return this.getSystemDefaults(category);
    }

    return providers.map(p => ({
      credentials: p.credentials as Credentials,
      settings: p.settings as Record<string, unknown> | undefined,
      source: (context.projectId ? 'project' : 'organization') as 'project' | 'organization',
      providerId: p.id,
      provider: p.provider,
    }));
  }

  async usesOwnCredentials(
    organizationId: string,
    category: ProviderCategory
  ): Promise<boolean> {
    const count = await database.organizationProvider.count({
      where: {
        organizationId,
        category,
        isActive: true,
        builderProjectId: null,
      },
    });
    return count > 0;
  }

  async listOrganizationProviders(organizationId: string) {
    return database.organizationProvider.findMany({
      where: { organizationId, builderProjectId: null },
      orderBy: [{ category: 'asc' }, { priority: 'asc' }],
    });
  }

  async listProjectProviders(projectId: string) {
    return database.organizationProvider.findMany({
      where: { builderProjectId: projectId, isActive: true },
      orderBy: [{ category: 'asc' }, { priority: 'asc' }],
    });
  }

  async testProvider(providerId: string): Promise<{ success: boolean; error?: string; latency?: number }> {
    const provider = await database.organizationProvider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      return { success: false, error: 'Provider not found' };
    }

    const start = Date.now();

    try {
      const credentials = provider.credentials as Credentials;
      let success = false;
      let error: string | undefined;

      switch (provider.category) {
        case 'AI':
          success = await this.testAIProvider(provider.provider, credentials);
          break;
        case 'INFRASTRUCTURE':
          success = await this.testInfrastructureProvider(provider.provider, credentials);
          break;
        default:
          success = !!credentials.apiKey;
      }

      const latency = Date.now() - start;

      await database.organizationProvider.update({
        where: { id: providerId },
        data: {
          lastTestedAt: new Date(),
          lastTestStatus: success ? 'success' : 'failed',
          lastTestError: error || null,
        },
      });

      return { success, latency, error };
    } catch (err) {
      const latency = Date.now() - start;
      const error = err instanceof Error ? err.message : 'Unknown error';

      await database.organizationProvider.update({
        where: { id: providerId },
        data: {
          lastTestedAt: new Date(),
          lastTestStatus: 'failed',
          lastTestError: error,
        },
      });

      return { success: false, latency, error };
    }
  }

  // ==================== PRIVATE METHODS ====================

  private async getConnectionCredentials(
    connectionId: string,
    category: ProviderCategory,
    provider: string
  ): Promise<ResolvedCredentials | null> {
    const settings = await database.connectionSettings.findUnique({
      where: { connectionId },
    });

    if (!settings) return null;

    if (category === 'AUXILIARY' && provider === 'google-maps') {
      if (settings.geocodingApiKey) {
        return {
          credentials: { apiKey: settings.geocodingApiKey },
          source: 'connection',
          provider,
        };
      }
    }

    return null;
  }

  private getSystemDefault(category: ProviderCategory, provider: string): Credentials | null {
    const categoryDefaults = SYSTEM_DEFAULTS[category];
    if (!categoryDefaults) return null;

    const getDefault = categoryDefaults[provider];
    if (!getDefault) return null;

    return getDefault();
  }

  private getSystemDefaults(category: ProviderCategory): ResolvedCredentials[] {
    const categoryDefaults = SYSTEM_DEFAULTS[category];
    if (!categoryDefaults) return [];

    const results: ResolvedCredentials[] = [];

    for (const [provider, getDefault] of Object.entries(categoryDefaults)) {
      const creds = getDefault();
      if (creds) {
        results.push({
          credentials: creds,
          source: 'system',
          provider,
        });
      }
    }

    return results;
  }

  private async testAIProvider(provider: string, credentials: Credentials): Promise<boolean> {
    if (!credentials.apiKey) return false;

    try {
      switch (provider) {
        case 'openai': {
          const response = await fetch(`${credentials.apiUrl || 'https://api.openai.com/v1'}/models`, {
            headers: { Authorization: `Bearer ${credentials.apiKey}` },
            signal: AbortSignal.timeout(5000),
          });
          return response.ok;
        }
        case 'anthropic': {
          return credentials.apiKey.startsWith('sk-ant-');
        }
        default:
          return !!credentials.apiKey;
      }
    } catch {
      return false;
    }
  }

  private async testInfrastructureProvider(provider: string, credentials: Credentials): Promise<boolean> {
    try {
      switch (provider) {
        case 'redis': {
          if (!credentials.apiUrl) return false;
          const url = new URL(credentials.apiUrl);
          return url.protocol === 'redis:' || url.protocol === 'rediss:';
        }
        case 'postgresql': {
          if (!credentials.apiUrl) return false;
          const url = new URL(credentials.apiUrl);
          return url.protocol === 'postgresql:' || url.protocol === 'postgres:';
        }
        case 'supabase': {
          if (!credentials.apiUrl || !credentials.apiKey) return false;
          const response = await fetch(`${credentials.apiUrl}/rest/v1/`, {
            headers: { apikey: credentials.apiKey },
            signal: AbortSignal.timeout(5000),
          });
          return response.ok || response.status === 400;
        }
        default:
          return !!credentials.apiUrl || !!credentials.apiKey;
      }
    } catch {
      return false;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  invalidateOrganization(organizationId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(organizationId)) {
        this.cache.delete(key);
      }
    }
  }

  invalidateProject(projectId: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(`:${projectId}:`)) {
        this.cache.delete(key);
      }
    }
  }
}

export const credentialResolver = new CredentialResolverService();
