/**
 * US-104 — authProcedure unit tests
 *
 * The procedure is built with `igniter.procedure({ handler })`. To test the
 * handler in isolation we mock `@/igniter` so the wrapper just hands the
 * handler back unchanged, and we mock the AuthRepository so we never touch
 * a real Prisma client. JWT_SECRET is stubbed before the procedure module
 * is dynamically imported.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// 1. Stub env BEFORE importing anything that reads it.
process.env.JWT_SECRET = 'test-secret-procedure-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-procedure-0123456789';

// 2. Mock @/igniter so procedure() returns the raw handler descriptor.
vi.mock('@/igniter', () => ({
  igniter: {
    procedure: (def: { name: string; handler: unknown }) => def,
  },
}));

// 3. Mock the AuthRepository — its constructor accepts a Prisma client.
vi.mock('@/server/core/auth/repositories/auth.repository', () => ({
  AuthRepository: class {
    constructor(public db: unknown) {}
  },
}));

// 4. Mock the permissions module — the procedure calls
//    getCustomRolePermissions when a customRoleId is present. We default to
//    returning null so the customRole branch stays inert unless a test
//    explicitly opts in.
vi.mock('@/lib/auth/permissions', () => ({
  getCustomRolePermissions: vi.fn().mockResolvedValue(null),
}));

interface FakeUser {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  organizations: Array<{
    organizationId: string;
    isActive: boolean;
    customRoleId?: string | null;
    organization: { id: string };
  }>;
}

interface FakeDb {
  user: { findUnique: ReturnType<typeof vi.fn> };
  customRole: { findUnique: ReturnType<typeof vi.fn> };
}

interface ProcedureContext {
  request: Request;
  response: unknown;
  context: { db: FakeDb };
}

interface ProcedureHandlerDescriptor {
  name: string;
  handler: (
    options: { required?: boolean },
    ctx: ProcedureContext
  ) => Promise<unknown>;
}

let authProcedure: ProcedureHandlerDescriptor;
let signAccessToken: (p: Record<string, unknown>) => string;

beforeAll(async () => {
  const jwtMod = await import('@/lib/auth/jwt');
  signAccessToken = jwtMod.signAccessToken as unknown as typeof signAccessToken;
  const procMod = await import('@/server/core/auth/procedures/auth.procedure');
  authProcedure = procMod.authProcedure as unknown as ProcedureHandlerDescriptor;
});

function buildFakeUser(overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    role: 'user',
    isActive: true,
    organizations: [],
    ...overrides,
  };
}

function buildCtx(headers: Record<string, string>, user: FakeUser | null): ProcedureContext {
  const db: FakeDb = {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    customRole: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  return {
    request: new Request('http://localhost/test', { headers }),
    response: {},
    context: { db },
  };
}

interface AuthSuccess {
  auth: {
    session: { user: FakeUser | null };
    repository: unknown;
    customRole: unknown;
  };
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

function isAuthSuccess(value: unknown): value is AuthSuccess {
  return (
    typeof value === 'object' &&
    value !== null &&
    'auth' in value &&
    typeof (value as { auth: unknown }).auth === 'object'
  );
}

describe('authProcedure handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects with 401 when no token is present and auth is required', async () => {
    const ctx = buildCtx({}, null);
    const result = await authProcedure.handler({ required: true }, ctx);
    expect(isResponse(result)).toBe(true);
    if (isResponse(result)) {
      expect(result.status).toBe(401);
    }
  });

  it('returns null user when no token is present and auth is optional', async () => {
    const ctx = buildCtx({}, null);
    const result = await authProcedure.handler({ required: false }, ctx);
    expect(isAuthSuccess(result)).toBe(true);
    if (isAuthSuccess(result)) {
      expect(result.auth.session.user).toBeNull();
    }
  });

  it('rejects with 401 when token is malformed', async () => {
    const ctx = buildCtx({ authorization: 'Bearer not.a.valid.jwt' }, null);
    const result = await authProcedure.handler({ required: true }, ctx);
    expect(isResponse(result)).toBe(true);
    if (isResponse(result)) {
      expect(result.status).toBe(401);
    }
  });

  it('rejects with 401 when token is valid but user is not found', async () => {
    const token = signAccessToken({
      userId: 'ghost',
      email: 'ghost@example.com',
      role: 'user',
      currentOrgId: null,
      organizationRole: null,
    });
    const ctx = buildCtx({ authorization: `Bearer ${token}` }, null);
    const result = await authProcedure.handler({ required: true }, ctx);
    expect(isResponse(result)).toBe(true);
    if (isResponse(result)) {
      expect(result.status).toBe(401);
    }
  });

  it('attaches the user to context when token is valid', async () => {
    const user = buildFakeUser();
    const token = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      currentOrgId: null,
      organizationRole: null,
    });
    const ctx = buildCtx({ authorization: `Bearer ${token}` }, user);

    const result = await authProcedure.handler({ required: true }, ctx);
    expect(isAuthSuccess(result)).toBe(true);
    if (isAuthSuccess(result)) {
      expect(result.auth.session.user).not.toBeNull();
      expect(result.auth.session.user?.email).toBe(user.email);
    }
    expect(ctx.context.db.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('rejects an inactive user with 401 when auth is required', async () => {
    const user = buildFakeUser({ isActive: false });
    const token = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      currentOrgId: null,
      organizationRole: null,
    });
    const ctx = buildCtx({ authorization: `Bearer ${token}` }, user);

    const result = await authProcedure.handler({ required: true }, ctx);
    expect(isResponse(result)).toBe(true);
    if (isResponse(result)) {
      expect(result.status).toBe(401);
    }
  });

  it('reads the access token from the cookie header when no Authorization header is present', async () => {
    const user = buildFakeUser({ id: 'user-cookie' });
    const token = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      currentOrgId: null,
      organizationRole: null,
    });
    const ctx = buildCtx({ cookie: `accessToken=${token}` }, user);

    const result = await authProcedure.handler({ required: true }, ctx);
    expect(isAuthSuccess(result)).toBe(true);
    if (isAuthSuccess(result)) {
      expect(result.auth.session.user?.id).toBe('user-cookie');
    }
  });
});
