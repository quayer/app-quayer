/**
 * Rate Limit Library - Barrel Export
 *
 * Re-exports all exports from rate-limiter.ts for backward compatibility.
 * This ensures imports from '@/lib/rate-limit' work correctly.
 */

export * from './rate-limiter';

// Explicit re-exports for commonly used utilities
export { authRateLimiter, getClientIdentifier } from './rate-limiter';
