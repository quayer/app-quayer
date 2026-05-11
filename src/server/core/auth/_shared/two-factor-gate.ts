/**
 * Auth _shared/two-factor-gate.ts
 *
 * Gate de 2FA reutilizável: se o usuário tem TOTP ativo, emite um JWT de
 * 2fa-challenge (5min) e registra audit log. Substitui o bloco repetido em
 * email-otp, magic-link, passkey e oauth-google.
 *
 * Uso típico (depois de validar o 1º fator):
 *   const gate = await check2faAndIssueChallenge(user, request, 'magic-link');
 *   if (gate) return response.success(gate);
 *
 * Doc: `_shared/_shared.skill.md`
 */

import { sign2faChallenge, createAuditLog } from './helpers';

export type TwoFactorMethod =
  | 'email-otp'
  | 'phone-otp'
  | 'magic-link'
  | 'passkey'
  | 'passkey-conditional'
  | 'google';

export type TwoFactorGateUser = {
  id: string;
  email: string;
  twoFactorEnabled: boolean;
  currentOrgId: string | null;
};

export type TwoFactorChallengeResponse = {
  requiresTwoFactor: true;
  challengeId: string;
  user: { id: string; email: string };
};

/**
 * Retorna a response payload de challenge quando 2FA está ativo, ou `null` se
 * o usuário não tem 2FA habilitado (caller deve seguir o fluxo normal).
 *
 * O audit log é gravado fail-open — mesmo que falhe, o challenge é retornado.
 */
export async function check2faAndIssueChallenge(
  user: TwoFactorGateUser,
  request: { headers: { get?: (key: string) => string | null; [key: string]: any } },
  method: TwoFactorMethod,
): Promise<TwoFactorChallengeResponse | null> {
  if (!user.twoFactorEnabled) return null;

  const challengeId = sign2faChallenge(user.id);

  // fail-open: erros no audit log não devem bloquear o challenge
  try {
    await createAuditLog(
      '2FA_CHALLENGE_ISSUED',
      user.id,
      request,
      { method },
      user.currentOrgId,
    );
  } catch (err) {
    console.error('[TwoFactorGate] audit log failed:', err);
  }

  return {
    requiresTwoFactor: true,
    challengeId,
    user: { id: user.id, email: user.email },
  };
}
