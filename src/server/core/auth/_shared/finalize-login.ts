/**
 * Auth _shared/finalize-login.ts
 *
 * Compõe `issueSession` + `registerDeviceSession` + `createAuditLog` em uma
 * única chamada para o caminho feliz de "1º fator validado, sem 2FA". Caller
 * recebe o "blocked-by-geo" e os tokens, e decide o shape da response.
 *
 * Para checar 2FA antes do login, ver `_shared/two-factor-gate.ts`.
 *
 * Doc: `_shared/_shared.skill.md`
 */

import { issueSession, type IssueSessionOptions, type IssueSessionResult, type SessionUser } from './issue-session';
import { registerDeviceSession, createAuditLog } from './helpers';

export type FinalizeLoginMethod =
  | 'email-otp'
  | 'magic-link'
  | 'passkey'
  | 'passkey-conditional'
  | 'google';

export type FinalizeLoginAction =
  | 'auth.login'
  | 'auth.signup'
  | 'user.login'
  | 'user.signup'
  | 'user.email_verified';

export type FinalizeLoginInput = {
  user: SessionUser & { currentOrgId: string | null };
  request: { headers: { get?: (key: string) => string | null; [key: string]: any } };
  response: any;
  method: FinalizeLoginMethod;
  /**
   * Lista de pares (action, audit metadata extra) a registrar após emitir
   * a sessão. Comum: `[{ action: 'user.login' }, { action: 'auth.login' }]`.
   */
  auditEvents?: Array<{ action: FinalizeLoginAction; metadata?: Record<string, unknown> }>;
  /** Override de cookie/JWT expirations. */
  issueOptions?: IssueSessionOptions;
};

export type FinalizeLoginOutput =
  | { blocked: true; reason: 'geo_blocked' }
  | { blocked: false; session: IssueSessionResult };

/**
 * Caminho feliz pós-1º-fator:
 *  1. registerDeviceSession (geo check pode bloquear → retorna blocked:true)
 *  2. issueSession (JWT + cookies)
 *  3. createAuditLog (fail-open) para cada evento informado
 *
 * Callers que precisam responder com `requiresTwoFactor` antes disso devem
 * checar `check2faAndIssueChallenge` previamente.
 */
export async function finalizeLogin(input: FinalizeLoginInput): Promise<FinalizeLoginOutput> {
  const { user, request, response, method, auditEvents = [], issueOptions } = input;

  // 1. Device + geo policy
  const deviceResult = await registerDeviceSession(user.id, request);
  if (deviceResult.blocked) {
    return { blocked: true, reason: 'geo_blocked' };
  }

  // 2. Tokens + cookies
  const session = await issueSession(response, user, issueOptions);

  // 3. Audit (fail-open dentro do createAuditLog)
  for (const evt of auditEvents) {
    await createAuditLog(
      evt.action,
      user.id,
      request,
      { method, ...(evt.metadata ?? {}) },
      user.currentOrgId,
    );
  }

  return { blocked: false, session };
}
