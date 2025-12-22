/**
 * Geocoding Service
 *
 * Integração com Google Maps Geocoding API
 * Resolve latitude/longitude para endereço completo automaticamente
 *
 * Features:
 * - Reverse Geocoding (lat/lng → endereço)
 * - Cache em memória com TTL
 * - Fallback graceful (não bloqueia fluxo se falhar)
 * - Suporte a múltiplos idiomas
 */

export interface GeocodedAddress {
  formattedAddress: string;
  streetNumber?: string;
  route?: string;         // Nome da rua
  neighborhood?: string;  // Bairro
  city?: string;
  state?: string;
  stateCode?: string;     // SP, RJ, etc.
  country?: string;
  countryCode?: string;   // BR, US, etc.
  postalCode?: string;
  latitude: number;
  longitude: number;
}

export interface GeocodingConfig {
  enabled: boolean;
  apiKey: string;
  language?: string;      // 'pt-BR'
  timeout?: number;       // ms
  cacheEnabled?: boolean;
  cacheTTL?: number;      // segundos
}

interface CacheEntry {
  address: GeocodedAddress;
  expiresAt: number;
}

class GeocodingService {
  private cache: Map<string, CacheEntry>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cache = new Map();
    // Limpar cache expirado a cada 10 minutos
    this.cleanupInterval = setInterval(() => this.cleanExpiredCache(), 10 * 60 * 1000);
  }

  /**
   * Verificar se o serviço está configurado
   */
  isConfigured(): boolean {
    return !!process.env.GOOGLE_MAPS_API_KEY;
  }

  /**
   * Resolver latitude/longitude para endereço
   */
  async reverseGeocode(
    latitude: number,
    longitude: number,
    config?: Partial<GeocodingConfig>
  ): Promise<GeocodedAddress | null> {
    const apiKey = config?.apiKey || process.env.GOOGLE_MAPS_API_KEY;
    const enabled = config?.enabled !== false && process.env.GEOCODING_ENABLED !== 'false';

    if (!enabled) {
      console.log('[Geocoding] Service disabled');
      return null;
    }

    if (!apiKey) {
      console.warn('[Geocoding] API key not configured - set GOOGLE_MAPS_API_KEY');
      return null;
    }

    // Validar coordenadas
    if (!this.isValidCoordinate(latitude, longitude)) {
      console.warn('[Geocoding] Invalid coordinates:', { latitude, longitude });
      return null;
    }

    // Check cache
    const cacheKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.log('[Geocoding] Cache hit for', cacheKey);
      return cached.address;
    }

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('latlng', `${latitude},${longitude}`);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('language', config?.language || 'pt-BR');
      url.searchParams.set('result_type', 'street_address|route|neighborhood|locality');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config?.timeout || 5000);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error('[Geocoding] HTTP error:', response.status, response.statusText);
        return null;
      }

      const data = await response.json();

      if (data.status === 'ZERO_RESULTS') {
        console.log('[Geocoding] No results for', cacheKey);
        return null;
      }

      if (data.status !== 'OK' || !data.results?.[0]) {
        console.warn('[Geocoding] API error:', data.status, data.error_message);
        return null;
      }

      const result = data.results[0];
      const address = this.parseGoogleResult(result, latitude, longitude);

      // Cache result
      const cacheTTL = config?.cacheTTL || parseInt(process.env.GEOCODING_CACHE_TTL || '3600');
      this.cache.set(cacheKey, {
        address,
        expiresAt: Date.now() + cacheTTL * 1000,
      });

      console.log('[Geocoding] Resolved:', address.formattedAddress);
      return address;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('[Geocoding] Request timeout');
      } else {
        console.error('[Geocoding] Error:', error.message);
      }
      return null;
    }
  }

  /**
   * Resolver endereço para coordenadas (Forward Geocoding)
   */
  async forwardGeocode(
    address: string,
    config?: Partial<GeocodingConfig>
  ): Promise<{ latitude: number; longitude: number } | null> {
    const apiKey = config?.apiKey || process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.warn('[Geocoding] API key not configured');
      return null;
    }

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', address);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('language', config?.language || 'pt-BR');

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(config?.timeout || 5000),
      });

      const data = await response.json();

      if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location) {
        return null;
      }

      const { lat, lng } = data.results[0].geometry.location;
      return { latitude: lat, longitude: lng };

    } catch (error) {
      console.error('[Geocoding] Forward geocode error:', error);
      return null;
    }
  }

  /**
   * Parse resultado da API do Google
   */
  private parseGoogleResult(result: any, lat: number, lng: number): GeocodedAddress {
    const components = result.address_components || [];

    const getComponent = (type: string): string | undefined => {
      const comp = components.find((c: any) => c.types.includes(type));
      return comp?.long_name;
    };

    const getShortComponent = (type: string): string | undefined => {
      const comp = components.find((c: any) => c.types.includes(type));
      return comp?.short_name;
    };

    return {
      formattedAddress: result.formatted_address,
      streetNumber: getComponent('street_number'),
      route: getComponent('route'),
      neighborhood: getComponent('sublocality_level_1') ||
                   getComponent('sublocality') ||
                   getComponent('neighborhood'),
      city: getComponent('administrative_area_level_2') ||
            getComponent('locality'),
      state: getComponent('administrative_area_level_1'),
      stateCode: getShortComponent('administrative_area_level_1'),
      country: getComponent('country'),
      countryCode: getShortComponent('country'),
      postalCode: getComponent('postal_code'),
      latitude: lat,
      longitude: lng,
    };
  }

  /**
   * Validar coordenadas
   */
  private isValidCoordinate(lat: number, lng: number): boolean {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !isNaN(lat) &&
      !isNaN(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  }

  /**
   * Limpar cache expirado
   */
  cleanExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt < now) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[Geocoding] Cleaned ${cleaned} expired cache entries`);
    }
  }

  /**
   * Obter estatísticas do cache
   */
  getCacheStats(): { size: number; hitRate?: number } {
    return {
      size: this.cache.size,
    };
  }

  /**
   * Limpar todo o cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[Geocoding] Cache cleared');
  }

  /**
   * Destruir serviço (cleanup)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// Singleton
export const geocodingService = new GeocodingService();
