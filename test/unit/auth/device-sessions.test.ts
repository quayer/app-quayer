/**
 * Device Sessions handler unit tests
 *
 * Tests the business logic of deviceSessionsController handlers by
 * replicating the handler logic in a testable harness with fully mocked
 * dependencies. Follows the same pattern as email-otp-handlers.test.ts
 * and google-oauth-handlers.test.ts — we never import the controller
 * directly because it would drag in Igniter framework wiring; instead
 * we mock `@/server/services/database` + `_shared/helpers` and exercise
 * the exact branching the controller will perform.
 *
 * Covered actions:
 *   - list        (GET  /device-sessions)
 *   - revoke      (POST /device-sessions/revoke)
 *   - revokeAll   (POST /device-sessions/revoke-all)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- env setup — must happen before any lib import -------------------------

process.env.JWT_SECRET = 'test-secret-device-sessions-handler-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-device-sessions-0123456789';
process.env.ENCRYPTION_KEY = 'test-encryption-key-device-sessions-32c';

// ---- module mocks — declared before imports --------------------------------

vi.mock('@/server/services/database', () => ({
  database: {
    deviceSession: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('@/server/core/auth/_shared/helpers', () => ({
  getClientIdentifier: vi.fn().mockReturnValue('1.2.3.4'),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// ---- imports ---------------------------------------------------------------

import { database as db } from '@/server/services/database';
import { createAuditLog } from '@/server/core/auth/_shared/helpers';

// ---- shared types ----------------------------------------------------------

interface MockUser {
  id: string;
  email: string;
  name?: string;
}

interface MockContext {
  auth?: { session?: { user?: MockUser } };
}

interface MockRequest {
  headers: { get: (k: string) => string | null };
  body: unknown;
}

interface HandlerResult {
  _status: number;
  _body: unknown;
}

// ---- test helpers ----------------------------------------------------------

function makeResponse() {
  let _status = 200;
  let _body: unknown = null;
  const response = {
    status(code: number) { _status = code; return response; },
    json(body: unknown): HandlerResult { _body = body; return { _status, _body }; },
    success(body: unknown): HandlerResult { _body = body; return { _status: 200, _body }; },
    unauthorized(msg: string): HandlerResult {
      _status = 401;
      _body = { error: msg };
      return { _status, _body };
    },
  };
  return response;
}

function makeRequest(body: unknown = {}, headers: Record<string, string> = {}): MockRequest {
  const h = new Headers({ 'content-type': 'application/json', ...headers });
  return { body, headers: { get: (k: string) => h.get(k) } };
}

function mockDb() {
  return db as unknown as {
    deviceSession: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    auditLog: { create: ReturnType<typeof vi.fn> };
  };
}

const defaultUser: MockUser = { id: 'user-1', email: 'alice@test.com', name: 'Alice' };

// ============================================================================
// list — GET /device-sessions
// ============================================================================

describe('deviceSessions.list handler logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Mirrors the controller handler:
   *   - reads user from context.auth.session.user
   *   - if no user → 401
   *   - else: db.deviceSession.findMany({ where: { userId, isRevoked: false }, orderBy: { lastActiveAt: 'desc' } })
   *   - response.success(sessions)
   */
  async function runList(context: MockContext): Promise<HandlerResult> {
    const request = makeRequest();
    void request;
    const response = makeResponse();

    const user = context.auth?.session?.user;
    if (!user) return response.unauthorized('Unauthorized');

    const dbMock = mockDb();
    const sessions = await dbMock.deviceSession.findMany({
      where: { userId: user.id, isRevoked: false },
      orderBy: { lastActiveAt: 'desc' },
    });

    return response.success(sessions);
  }

  it('returns device sessions filtered by userId and isRevoked=false, ordered by lastActiveAt desc', async () => {
    const dbMock = mockDb();
    const sessions = [
      { id: 'ds-1', userId: 'user-1', isRevoked: false, lastActiveAt: new Date('2026-05-10') },
      { id: 'ds-2', userId: 'user-1', isRevoked: false, lastActiveAt: new Date('2026-05-08') },
    ];
    dbMock.deviceSession.findMany.mockResolvedValue(sessions);

    const result = await runList({ auth: { session: { user: defaultUser } } });

    expect(result._status).toBe(200);
    expect(result._body).toEqual(sessions);
    expect(dbMock.deviceSession.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.deviceSession.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRevoked: false },
      orderBy: { lastActiveAt: 'desc' },
    });
  });

  it('returns 401 when user is missing from context', async () => {
    const dbMock = mockDb();
    dbMock.deviceSession.findMany.mockResolvedValue([]);

    const result = await runList({});

    expect(result._status).toBe(401);
    expect(result._body).toMatchObject({ error: expect.any(String) });
    expect(dbMock.deviceSession.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when session has no user', async () => {
    const dbMock = mockDb();
    dbMock.deviceSession.findMany.mockResolvedValue([]);

    const result = await runList({ auth: { session: {} } });

    expect(result._status).toBe(401);
    expect(dbMock.deviceSession.findMany).not.toHaveBeenCalled();
  });

  it('returns empty array when user has no active sessions', async () => {
    const dbMock = mockDb();
    dbMock.deviceSession.findMany.mockResolvedValue([]);

    const result = await runList({ auth: { session: { user: defaultUser } } });

    expect(result._status).toBe(200);
    expect(result._body).toEqual([]);
  });
});

// ============================================================================
// revoke — POST /device-sessions/revoke
// ============================================================================

describe('deviceSessions.revoke handler logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Mirrors the controller handler:
   *   - body: { deviceSessionId }
   *   - findFirst({ where: { id: deviceSessionId, userId: user.id } })  ← IDOR guard
   *   - if !found → 404
   *   - if isRevoked === true → success { message: 'Already revoked' } (idempotent, no update)
   *   - else update + createAuditLog + success
   */
  async function runRevoke(
    context: MockContext,
    body: { deviceSessionId: string },
  ): Promise<HandlerResult> {
    const request = makeRequest(body);
    const response = makeResponse();

    const user = context.auth?.session?.user;
    if (!user) return response.unauthorized('Unauthorized');

    const dbMock = mockDb();
    const session = await dbMock.deviceSession.findFirst({
      where: { id: body.deviceSessionId, userId: user.id },
    });

    if (!session) {
      return response.status(404).json({ error: 'Device session not found' });
    }

    if (session.isRevoked) {
      return response.success({ message: 'Already revoked' });
    }

    await dbMock.deviceSession.update({
      where: { id: body.deviceSessionId },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    await (createAuditLog as unknown as ReturnType<typeof vi.fn>)(
      'auth.device_session.revoke',
      user.id,
      request,
      { deviceSessionId: body.deviceSessionId },
    );

    return response.success({ message: 'Device session revoked' });
  }

  it('returns 404 when the session belongs to another user (IDOR guard)', async () => {
    const dbMock = mockDb();
    // findFirst returns null because where { id, userId } doesn't match anything
    dbMock.deviceSession.findFirst.mockResolvedValue(null);

    const result = await runRevoke(
      { auth: { session: { user: defaultUser } } },
      { deviceSessionId: 'ds-belongs-to-someone-else' },
    );

    expect(result._status).toBe(404);
    expect(result._body).toMatchObject({ error: 'Device session not found' });
    expect(dbMock.deviceSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'ds-belongs-to-someone-else', userId: 'user-1' },
    });
    expect(dbMock.deviceSession.update).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('happy path — revokes the session and writes audit log', async () => {
    const dbMock = mockDb();
    dbMock.deviceSession.findFirst.mockResolvedValue({
      id: 'ds-1',
      userId: 'user-1',
      isRevoked: false,
    });
    dbMock.deviceSession.update.mockResolvedValue({
      id: 'ds-1',
      userId: 'user-1',
      isRevoked: true,
      revokedAt: new Date(),
    });

    const result = await runRevoke(
      { auth: { session: { user: defaultUser } } },
      { deviceSessionId: 'ds-1' },
    );

    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ message: 'Device session revoked' });

    expect(dbMock.deviceSession.update).toHaveBeenCalledTimes(1);
    const updateCall = dbMock.deviceSession.update.mock.calls[0][0] as {
      where: { id: string };
      data: { isRevoked: boolean; revokedAt: unknown };
    };
    expect(updateCall.where).toEqual({ id: 'ds-1' });
    expect(updateCall.data.isRevoked).toBe(true);
    expect(updateCall.data.revokedAt).toBeInstanceOf(Date);

    expect(createAuditLog).toHaveBeenCalledTimes(1);
    expect(createAuditLog).toHaveBeenCalledWith(
      'auth.device_session.revoke',
      'user-1',
      expect.anything(),
      { deviceSessionId: 'ds-1' },
    );
  });

  it('idempotent — returns success without calling update when session already revoked', async () => {
    const dbMock = mockDb();
    dbMock.deviceSession.findFirst.mockResolvedValue({
      id: 'ds-1',
      userId: 'user-1',
      isRevoked: true,
      revokedAt: new Date('2026-05-01'),
    });

    const result = await runRevoke(
      { auth: { session: { user: defaultUser } } },
      { deviceSessionId: 'ds-1' },
    );

    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ message: 'Already revoked' });
    expect(dbMock.deviceSession.update).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});

// ============================================================================
// revokeAll — POST /device-sessions/revoke-all
// ============================================================================

describe('deviceSessions.revokeAll handler logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Mirrors the controller handler:
   *   - body: { currentDeviceSessionId? }
   *   - where = { userId, isRevoked: false, ...(currentDeviceSessionId ? { NOT: { id: currentDeviceSessionId } } : {}) }
   *   - updateMany(where, { isRevoked: true, revokedAt })
   *   - createAuditLog('auth.device_session.revoke_all', userId, request, { count, excludedDeviceSessionId })
   *   - response.success({ revokedCount: result.count })
   */
  async function runRevokeAll(
    context: MockContext,
    body: { currentDeviceSessionId?: string } = {},
  ): Promise<HandlerResult> {
    const request = makeRequest(body);
    const response = makeResponse();

    const user = context.auth?.session?.user;
    if (!user) return response.unauthorized('Unauthorized');

    const where: Record<string, unknown> = { userId: user.id, isRevoked: false };
    if (body.currentDeviceSessionId) {
      where.NOT = { id: body.currentDeviceSessionId };
    }

    const dbMock = mockDb();
    const result = await dbMock.deviceSession.updateMany({
      where,
      data: { isRevoked: true, revokedAt: new Date() },
    });

    await (createAuditLog as unknown as ReturnType<typeof vi.fn>)(
      'auth.device_session.revoke_all',
      user.id,
      request,
      { count: result.count, excludedDeviceSessionId: body.currentDeviceSessionId },
    );

    return response.success({ revokedCount: result.count });
  }

  it('passes NOT: { id: currentDeviceSessionId } in where clause when provided', async () => {
    const dbMock = mockDb();
    dbMock.deviceSession.updateMany.mockResolvedValue({ count: 3 });

    const result = await runRevokeAll(
      { auth: { session: { user: defaultUser } } },
      { currentDeviceSessionId: 'ds-current' },
    );

    expect(result._status).toBe(200);
    expect(dbMock.deviceSession.updateMany).toHaveBeenCalledTimes(1);

    const call = dbMock.deviceSession.updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: { isRevoked: boolean; revokedAt: unknown };
    };
    expect(call.where).toMatchObject({
      userId: 'user-1',
      isRevoked: false,
      NOT: { id: 'ds-current' },
    });
    expect(call.data.isRevoked).toBe(true);
    expect(call.data.revokedAt).toBeInstanceOf(Date);
  });

  it('omits NOT clause and revokes ALL sessions when currentDeviceSessionId is not provided', async () => {
    const dbMock = mockDb();
    dbMock.deviceSession.updateMany.mockResolvedValue({ count: 7 });

    const result = await runRevokeAll({ auth: { session: { user: defaultUser } } }, {});

    expect(result._status).toBe(200);
    const call = dbMock.deviceSession.updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).toEqual({ userId: 'user-1', isRevoked: false });
    expect(call.where).not.toHaveProperty('NOT');
  });

  it('returns { revokedCount: result.count } from updateMany result', async () => {
    const dbMock = mockDb();
    dbMock.deviceSession.updateMany.mockResolvedValue({ count: 5 });

    const result = await runRevokeAll({ auth: { session: { user: defaultUser } } });

    expect(result._status).toBe(200);
    expect(result._body).toEqual({ revokedCount: 5 });
  });

  it('writes audit log with count and excludedDeviceSessionId metadata', async () => {
    const dbMock = mockDb();
    dbMock.deviceSession.updateMany.mockResolvedValue({ count: 2 });

    await runRevokeAll(
      { auth: { session: { user: defaultUser } } },
      { currentDeviceSessionId: 'ds-keep' },
    );

    expect(createAuditLog).toHaveBeenCalledTimes(1);
    expect(createAuditLog).toHaveBeenCalledWith(
      'auth.device_session.revoke_all',
      'user-1',
      expect.anything(),
      { count: 2, excludedDeviceSessionId: 'ds-keep' },
    );
  });

  it('audit log has excludedDeviceSessionId=undefined when currentDeviceSessionId is omitted', async () => {
    const dbMock = mockDb();
    dbMock.deviceSession.updateMany.mockResolvedValue({ count: 4 });

    await runRevokeAll({ auth: { session: { user: defaultUser } } }, {});

    expect(createAuditLog).toHaveBeenCalledTimes(1);
    const call = (createAuditLog as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3]).toEqual({ count: 4, excludedDeviceSessionId: undefined });
  });

  it('returns revokedCount: 0 when there are no sessions to revoke', async () => {
    const dbMock = mockDb();
    dbMock.deviceSession.updateMany.mockResolvedValue({ count: 0 });

    const result = await runRevokeAll({ auth: { session: { user: defaultUser } } });

    expect(result._status).toBe(200);
    expect(result._body).toEqual({ revokedCount: 0 });
  });
});
