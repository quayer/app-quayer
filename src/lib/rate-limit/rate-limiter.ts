/**
 * Rate Limiter Service
 *
 * Sliding window via Redis sorted set (ZSET com timestamp como score+member).
 * Usa o singleton ioredis de src/server/services/redis.ts (Redis TCP local
 * do docker compose — antes era Upstash REST, migrado para reduzir latência
 * e usar a mesma instância já provisionada).
 */

import type { Redis } from 'ioredis';
import { getRedis } from '@/server/services/redis';

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

  /**
   * Se true, falha fechado (bloqueia) quando Redis está indisponível em produção.
   * Use para rotas críticas como login, OTP, logout.
   */
  failClosedInProduction?: boolean;
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
      failClosedInProduction: config.failClosedInProduction ?? false,
    };

    // Em homol/prod REDIS_URL é sempre setado pelo compose (homol-quayer-redis
    // / quayer-redis). Em dev local sem Redis rodando, getRedis() ainda
    // devolve um client com lazyConnect — operações falham e caem no
    // try/catch (fail-open ou fail-closed conforme config).
    if (process.env.REDIS_URL) {
      this.redis = getRedis();
    } else {
      console.warn(
        '[RateLimiter] REDIS_URL not set — rate limiting disabled (dev). ' +
        'Set REDIS_URL in .env or run docker compose up redis.'
      );
    }
  }

  /**
   * Verifica se uma requisição está dentro do limite
   *
   * @param identifier - Identificador único (IP, userId, etc)
   * @returns Resultado do rate limit
   */
  async check(identifier: string): Promise<RateLimitResult> {
    // Se Redis não configurado, verificar política de fail-closed
    if (!this.redis) {
      if (this.config.failClosedInProduction && (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV) === 'production') {
        return { success: false, remaining: 0, limit: this.config.limit, reset: Date.now() + this.config.window * 1000, retryAfter: this.config.window };
      }
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
      // Pipeline ioredis: zadd é posicional (key, score, member) — diferente
      // do @upstash/redis que aceitava { score, member } como objeto.
      // member precisa ser único por chamada — ZADD com mesmo member é no-op,
      // o que faria duas chamadas no mesmo ms colidirem.
      const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;
      const pipeline = this.redis.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zcard(key);
      pipeline.zadd(key, now, member);
      pipeline.expire(key, this.config.window);

      // ATENÇÃO: ioredis retorna `[ [err, value], ... ]` (tuplas), enquanto
      // @upstash/redis retornava `[ value, ... ]` (flat). Ler results[1][1]
      // — não results[1]. Sem isso, count vira NaN/array e o limiter
      // silenciosamente deixa passar tudo (fail-open invisível).
      const results = await pipeline.exec();

      if (!results) {
        throw new Error('pipeline.exec returned null');
      }

      const zcardEntry = results[1];
      const count = Number(zcardEntry?.[1] ?? 0);

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

      if (this.config.failClosedInProduction && (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV) === 'production') {
        return { success: false, remaining: 0, limit: this.config.limit, reset: now + this.config.window * 1000, retryAfter: this.config.window };
      }
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
 *
 * Production: 5 requisições por 15 minutos (proteção real contra brute force).
 * Outros ambientes (dev/homol): 50 requisições por 15 minutos para não
 * travar QA e desenvolvimento. Detectamos ambiente via NEXT_PUBLIC_APP_ENV
 * (definido em deploy-homol.yml/deploy-production.yml) com fallback para
 * NODE_ENV.
 */
const isStrictProd =
  (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV) === 'production';

export const authRateLimiter = new RateLimiter({
  limit: isStrictProd ? 5 : 50,
  window: 900, // 15 minutos
  prefix: 'ratelimit:auth',
  failClosedInProduction: true,
});

/**
 * Rate limiters para verificação de OTP (proteção contra brute-force)
 * 5 tentativas por 10 minutos em cada fluxo de verify
 */
export const otpVerifyEmailRateLimiter = new RateLimiter({
  limit: 5,
  window: 600, // 10 minutos
  prefix: 'ratelimit:otp-verify-email',
  failClosedInProduction: true,
});

export const otpVerifySignupRateLimiter = new RateLimiter({
  limit: 5,
  window: 600,
  prefix: 'ratelimit:otp-verify-signup',
  failClosedInProduction: true,
});

export const otpVerifyLoginRateLimiter = new RateLimiter({
  limit: 5,
  window: 600,
  prefix: 'ratelimit:otp-verify-login',
  failClosedInProduction: true,
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

// getClientIdentifier is the canonical implementation in
// src/server/core/auth/_shared/helpers.ts — import from there.
// The duplicate here was removed to eliminate drift between implementations.
