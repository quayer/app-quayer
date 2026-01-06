/**
 * Contact Cache Service
 *
 * Provides Redis caching for contact lookups to reduce database load
 * during webhook processing.
 */

import { redis } from '@/services/redis';
import { database } from '@/services/database';
import { logger } from '@/lib/logging/logger';
import type { Contact } from '@prisma/client';

// Cache TTL in seconds
const CONTACT_CACHE_TTL = 300; // 5 minutes
const CONNECTION_CACHE_TTL = 600; // 10 minutes

/**
 * Cache key generators
 */
const cacheKeys = {
  contact: (phoneNumber: string) => `contact:phone:${phoneNumber}`,
  connection: (id: string) => `connection:${id}`,
  connectionByToken: (token: string) => `connection:token:${token}`,
};

/**
 * Safely parse JSON from cache
 */
function safeJsonParse<T>(data: string | null, fallback: T | null = null): T | null {
  if (!data) return fallback;
  try {
    return JSON.parse(data) as T;
  } catch {
    // Corrupted cache data
    return fallback;
  }
}

/**
 * Get contact by phone number with caching
 */
export async function getCachedContact(phoneNumber: string): Promise<Contact | null> {
  const cacheKey = cacheKeys.contact(phoneNumber);

  try {
    // Try cache first
    const cached = await redis.get(cacheKey);
    const parsed = safeJsonParse<Contact>(cached);
    if (parsed) {
      return parsed;
    }
  } catch (error) {
    logger.debug('Contact cache get error', { phoneNumber, error });
  }

  // Fetch from DB
  const contact = await database.contact.findUnique({
    where: { phoneNumber },
  });

  // Store in cache if found
  if (contact) {
    try {
      await redis.setex(cacheKey, CONTACT_CACHE_TTL, JSON.stringify(contact));
    } catch (error) {
      logger.debug('Contact cache put error', { phoneNumber, error });
    }
  }

  return contact;
}

/**
 * Invalidate contact cache
 */
export async function invalidateContactCache(phoneNumber: string): Promise<void> {
  try {
    await redis.del(cacheKeys.contact(phoneNumber));
  } catch (error) {
    logger.debug('Contact cache invalidate error', { phoneNumber, error });
  }
}

/**
 * Update contact cache after create/update
 */
export async function updateContactCache(contact: Contact): Promise<void> {
  try {
    await redis.setex(
      cacheKeys.contact(contact.phoneNumber),
      CONTACT_CACHE_TTL,
      JSON.stringify(contact)
    );
  } catch (error) {
    logger.debug('Contact cache update error', { contactId: contact.id, error });
  }
}

/**
 * Connection type for caching
 */
type ConnectionCache = {
  id: string;
  organizationId: string;
  uazapiToken?: string | null;
  cloudApiPhoneNumberId?: string | null;
  status: string;
};

/**
 * Get connection by ID with caching
 */
export async function getCachedConnection(connectionId: string): Promise<ConnectionCache | null> {
  const cacheKey = cacheKeys.connection(connectionId);

  try {
    const cached = await redis.get(cacheKey);
    const parsed = safeJsonParse<ConnectionCache>(cached);
    if (parsed) {
      return parsed;
    }
  } catch {
    // Ignore cache read errors
  }

  // Fetch from DB
  const connection = await database.connection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      organizationId: true,
      uazapiToken: true,
      cloudApiPhoneNumberId: true,
      status: true,
    },
  });

  // Store in cache if found
  if (connection) {
    try {
      await redis.setex(cacheKey, CONNECTION_CACHE_TTL, JSON.stringify(connection));
    } catch {
      // Ignore cache write errors
    }
  }

  return connection as ConnectionCache | null;
}

/**
 * Get connection by UAZapi token with caching
 */
export async function getCachedConnectionByToken(token: string): Promise<ConnectionCache | null> {
  const cacheKey = cacheKeys.connectionByToken(token);

  try {
    const cached = await redis.get(cacheKey);
    const parsed = safeJsonParse<ConnectionCache>(cached);
    if (parsed) {
      return parsed;
    }
  } catch {
    // Ignore cache read errors
  }

  // Fetch from DB
  const connection = await database.connection.findFirst({
    where: { uazapiToken: token },
    select: {
      id: true,
      organizationId: true,
      uazapiToken: true,
      cloudApiPhoneNumberId: true,
      status: true,
    },
  });

  // Store in cache if found
  if (connection) {
    try {
      await redis.setex(cacheKey, CONNECTION_CACHE_TTL, JSON.stringify(connection));
      // Also cache by ID
      await redis.setex(cacheKeys.connection(connection.id), CONNECTION_CACHE_TTL, JSON.stringify(connection));
    } catch {
      // Ignore cache write errors
    }
  }

  return connection as ConnectionCache | null;
}

/**
 * Invalidate connection cache
 */
export async function invalidateConnectionCache(connectionId: string, token?: string): Promise<void> {
  try {
    await redis.del(cacheKeys.connection(connectionId));
    if (token) {
      await redis.del(cacheKeys.connectionByToken(token));
    }
  } catch {
    // Ignore cache invalidation errors
  }
}
