/**
 * Rate Limiter Service
 *
 * Sistema de rate limiting usando Redis (Upstash ou local)
 * Implementa sliding window algorithm
 */

import { Redis } from '@upstash/redis';

/**
 * Configuração do Rate Limiter
 */
export interface RateLimitConfig {
  /**
   * Número máximo de requisições
   */
  limit: number;

  /**
   * Janela de tempo em segundos
   */
  window: number;

  /**
   * Prefixo da chave no Redis
   */
  prefix?: string;
}

/**
 * Resultado da verificação de rate limit
 */
export interface RateLimitResult {
  /**
   * Se a requisição está permitida
   */
  success: boolean;

  /**
   * Número de requisições restantes
   */
  remaining: number;

  /**
   * Limite total
   */
  limit: number;

  /**
   * Timestamp de reset (Unix timestamp)
   */
  reset: number;

  /**
   * Tempo de espera em segundos (se bloqueado)
   */
  retryAfter?: number;
}

/**
 * Rate Limiter usando Redis
 */
export class RateLimiter {
  private redis: Redis | null = null;
  private config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      ...config,
      prefix: config.prefix || 'ratelimit',
    };

    // Tentar conectar ao Upstash Redis
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (upstashUrl && upstashToken) {
      this.redis = new Redis({
        url: upstashUrl,
        token: upstashToken,
      });
      console.log('✅ Rate Limiter configured with Upstash Redis');
    } else {
      console.warn('⚠️  Upstash Redis not configured. Rate limiting disabled.');
    }
  }

  /**
   * Verifica se uma requisição está dentro do limite
   *
   * @param identifier - Identificador único (IP, userId, etc)
   * @returns Resultado do rate limit
   */
  async check(identifier: string): Promise<RateLimitResult> {
    // Se Redis não configurado, permitir todas as requisições
    if (!this.redis) {
      return {
        success: true,
        remaining: this.config.limit,
        limit: this.config.limit,
        reset: Date.now() + this.config.window * 1000,
      };
    }

    const key = `${this.config.prefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - this.config.window * 1000;

    try {
      // Usar pipeline para operações atômicas
      const pipeline = this.redis.pipeline();

      // 1. Remover timestamps antigos
      pipeline.zremrangebyscore(key, 0, windowStart);

      // 2. Contar requisições na janela
      pipeline.zcard(key);

      // 3. Adicionar timestamp atual
      pipeline.zadd(key, { score: now, member: now });

      // 4. Definir expiração da chave
      pipeline.expire(key, this.config.window);

      const results = await pipeline.exec();

      // Resultado do ZCARD (índice 1)
      const count = (results[1] as number) || 0;

      const remaining = Math.max(0, this.config.limit - count - 1);
      const reset = now + this.config.window * 1000;

      if (count >= this.config.limit) {
        return {
          success: false,
          remaining: 0,
          limit: this.config.limit,
          reset,
          retryAfter: this.config.window,
        };
      }

      return {
        success: true,
        remaining,
        limit: this.config.limit,
        reset,
      };
    } catch (error) {
      console.error('Error checking rate limit:', error);

      // Em caso de erro, permitir a requisição (fail open)
      return {
        success: true,
        remaining: this.config.limit,
        limit: this.config.limit,
        reset: now + this.config.window * 1000,
      };
    }
  }

  /**
   * Reseta o contador para um identificador
   */
  async reset(identifier: string): Promise<void> {
    if (!this.redis) return;

    const key = `${this.config.prefix}:${identifier}`;
    await this.redis.del(key);
  }
}

/**
 * Rate limiters pré-configurados
 */

/**
 * Rate limiter para autenticação (login, register)
 * 5 requisições por 15 minutos
 */
export const authRateLimiter = new RateLimiter({
  limit: 5,
  window: 900, // 15 minutos
  prefix: 'ratelimit:auth',
});

/**
 * Rate limiter para API geral
 * 100 requisições por minuto
 */
export const apiRateLimiter = new RateLimiter({
  limit: 100,
  window: 60, // 1 minuto
  prefix: 'ratelimit:api',
});

/**
 * Rate limiter para envio de mensagens
 * 30 mensagens por minuto
 */
export const messageRateLimiter = new RateLimiter({
  limit: 30,
  window: 60, // 1 minuto
  prefix: 'ratelimit:messages',
});

/**
 * Rate limiter para webhooks
 * 1000 requisições por minuto
 */
export const webhookRateLimiter = new RateLimiter({
  limit: 1000,
  window: 60, // 1 minuto
  prefix: 'ratelimit:webhooks',
});

/**
 * Rate limiter por sessão de chat
 * 20 mensagens por minuto por sessão
 * Previne spam e abuso de envio de mensagens
 */
export const sessionRateLimiter = new RateLimiter({
  limit: 20,
  window: 60, // 1 minuto
  prefix: 'ratelimit:session',
});

/**
 * Helper para extrair identificador da requisição
 */
export function getClientIdentifier(req: Request | { ip?: string; headers: Headers }): string {
  // Tentar obter IP real (atrás de proxy)
  const forwardedFor = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');

  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  // Fallback para IP direto (se disponível)
  if ('ip' in req && req.ip) {
    return req.ip;
  }

  // Último fallback - usar header de user agent como identificador
  return req.headers.get('user-agent') || 'unknown';
}
