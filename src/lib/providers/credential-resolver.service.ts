/**
 * Credential Resolver Service
 *
 * Resolve credenciais seguindo hierarquia BYOC:
 * 1. ConnectionSettings (override por instância WhatsApp)
 * 2. OrganizationProvider (credencial da organização)
 * 3. SystemDefault (variáveis de ambiente do Quayer)
 *
 * Features:
 * - Resolução hierárquica de credenciais
 * - Fallback automático entre provedores
 * - Cache de credenciais resolvidas
 * - Suporte a múltiplas categorias (AI, Transcription, TTS, Infrastructure)
 */

import { database } from '@/services/database';
import type { ProviderCategory } from '@prisma/client';

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
  source: 'connection' | 'organization' | 'system';
  providerId?: string;
  provider: string;
}

export interface ResolveContext {
  organizationId: string;
  connectionId?: string;
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
   * 2. OrganizationProvider (credencial da org)
   * 3. System Default (env vars do Quayer)
   */
  async resolve(
    category: ProviderCategory,
    provider: string,
    context: ResolveContext
  ): Promise<ResolvedCredentials | null> {
    const cacheKey = `${context.organizationId}:${context.connectionId || ''}:${category}:${provider}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // 1. Verificar override por instância (ConnectionSettings)
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

    // 2. Buscar provedor da organização
    const orgProvider = await database.organizationProvider.findFirst({
      where: {
        organizationId: context.organizationId,
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

    // 3. Fallback para default do sistema
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
   * Resolve com fallback automático
   * Se o provedor primário falhar, tenta os alternativos
   */
  async resolveWithFallback(
    category: ProviderCategory,
    context: ResolveContext
  ): Promise<ResolvedCredentials[]> {
    const providers = await database.organizationProvider.findMany({
      where: {
        organizationId: context.organizationId,
        category,
        isActive: true,
      },
      orderBy: { priority: 'asc' },
    });

    if (providers.length === 0) {
      // Usar defaults do sistema
      return this.getSystemDefaults(category);
    }

    return providers.map(p => ({
      credentials: p.credentials as Credentials,
      settings: p.settings as Record<string, unknown> | undefined,
      source: 'organization' as const,
      providerId: p.id,
      provider: p.provider,
    }));
  }

  /**
   * Verificar se organização usa credenciais próprias
   */
  async usesOwnCredentials(
    organizationId: string,
    category: ProviderCategory
  ): Promise<boolean> {
    const count = await database.organizationProvider.count({
      where: {
        organizationId,
        category,
        isActive: true,
      },
    });
    return count > 0;
  }

  /**
   * Listar todos os provedores configurados de uma organização
   */
  async listOrganizationProviders(organizationId: string) {
    return database.organizationProvider.findMany({
      where: { organizationId },
      orderBy: [{ category: 'asc' }, { priority: 'asc' }],
    });
  }

  /**
   * Testar conexão com um provedor
   */
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

      // Testar baseado na categoria
      switch (provider.category) {
        case 'AI':
          success = await this.testAIProvider(provider.provider, credentials);
          break;
        case 'INFRASTRUCTURE':
          success = await this.testInfrastructureProvider(provider.provider, credentials);
          break;
        default:
          // Para outras categorias, apenas verificar se tem apiKey
          success = !!credentials.apiKey;
      }

      const latency = Date.now() - start;

      // Atualizar status do teste
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
    // Buscar ConnectionSettings
    const settings = await database.connectionSettings.findUnique({
      where: { connectionId },
    });

    if (!settings) return null;

    // Mapear campos de settings para credenciais específicas
    if (category === 'AUXILIARY' && provider === 'google-maps') {
      if (settings.geocodingApiKey) {
        return {
          credentials: { apiKey: settings.geocodingApiKey },
          source: 'connection',
          provider,
        };
      }
    }

    // Adicionar mais mapeamentos conforme necessário
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
          // Anthropic não tem endpoint de health check público
          // Apenas verificar formato da key
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
          // Para Redis, verificar se a URL é válida
          if (!credentials.apiUrl) return false;
          const url = new URL(credentials.apiUrl);
          return url.protocol === 'redis:' || url.protocol === 'rediss:';
        }
        case 'postgresql': {
          // Para PostgreSQL, verificar se a URL é válida
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
          return response.ok || response.status === 400; // 400 = no table specified (ok)
        }
        default:
          return !!credentials.apiUrl || !!credentials.apiKey;
      }
    } catch {
      return false;
    }
  }

  /**
   * Limpar cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Invalidar cache para uma organização
   */
  invalidateOrganization(organizationId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(organizationId)) {
        this.cache.delete(key);
      }
    }
  }
}

// Singleton
export const credentialResolver = new CredentialResolverService();
