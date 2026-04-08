import { createHash } from 'node:crypto';

interface CleanupAuditPayload {
  route: string;
  method?: string;
  userAgent?: string | null;
  referrer?: string | null;
  ipHashed: string;
  hasAuthCookie: boolean;
  timestamp: string;
}

function hashIp(ip: string | null | undefined): string {
  if (!ip) return 'unknown';
  const salt = process.env.IGNITER_APP_SECRET ?? 'dev-fallback-salt';
  return createHash('sha256').update(salt + ip).digest('hex').slice(0, 16);
}

export function logCleanupAccess(input: {
  route: string;
  method?: string;
  userAgent?: string | null;
  referrer?: string | null;
  ip?: string | null;
  hasAuthCookie: boolean;
}): void {
  const payload: CleanupAuditPayload = {
    route: input.route,
    method: input.method,
    userAgent: input.userAgent ?? null,
    referrer: input.referrer ?? null,
    ipHashed: hashIp(input.ip ?? null),
    hasAuthCookie: input.hasAuthCookie,
    timestamp: new Date().toISOString(),
  };
  // [cleanup-audit] prefix is the grep key for US-204 log analysis
  console.info('[cleanup-audit]', JSON.stringify(payload));
}

export { hashIp };
