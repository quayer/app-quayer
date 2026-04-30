/**
 * IP Geolocation Service
 *
 * Resolve endereço IP para país/cidade usando ip-api.com (gratuito, sem chave).
 * Cache em Redis por 24h para evitar re-lookup.
 * Fallback gracioso: nunca bloqueia login se API falhar.
 */

import { redis } from '@/server/services/redis';

export interface IpGeoResult {
  country: string;
  countryCode: string;
  city?: string;
  region?: string;
}

const CACHE_TTL_SECONDS = 86400; // 24h
const API_TIMEOUT_MS = 3000;

// IPs privados/locais que não precisam de lookup
const PRIVATE_IP_REGEX = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|::1|0\.0\.0\.0|localhost|unknown)/;

/**
 * Resolve IP para geolocalização
 *
 * @param ip - Endereço IP do client
 * @returns Resultado com país/cidade ou fallback 'Unknown'
 */
export async function getIpGeolocation(ip: string): Promise<IpGeoResult> {
  // IPs privados/locais
  if (!ip || PRIVATE_IP_REGEX.test(ip)) {
    return { country: 'Local', countryCode: 'LO' };
  }

  // Tentar cache Redis
  try {
    const cached = await redis.get(`geo:ip:${ip}`);
    if (cached) {
      return JSON.parse(cached) as IpGeoResult;
    }
  } catch {
    // Cache miss or Redis unavailable — continue to API
  }

  // Chamar ip-api.com
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      return { country: 'Unknown', countryCode: 'XX' };
    }

    const data = await res.json();
    if (data.status !== 'success') {
      return { country: 'Unknown', countryCode: 'XX' };
    }

    const result: IpGeoResult = {
      country: data.country || 'Unknown',
      countryCode: data.countryCode || 'XX',
      city: data.city || undefined,
      region: data.regionName || undefined,
    };

    // Salvar no cache Redis (non-blocking)
    try {
      await redis.setex(`geo:ip:${ip}`, CACHE_TTL_SECONDS, JSON.stringify(result));
    } catch {
      // Cache write failure — non-blocking
    }

    return result;
  } catch {
    // API failure — fail-open
    return { country: 'Unknown', countryCode: 'XX' };
  }
}
