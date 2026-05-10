/**
 * Auth _shared/issue-session.ts
 *
 * Emite uma sessão autenticada: gera access/refresh JWT, persiste o refresh em
 * BD (com tokenId correto) e instala os cookies httpOnly. Substitui o bloco de
 * ~30 linhas que estava duplicado em email-otp, magic-link, oauth-google e
 * passkey.
 *
 * Doc: `_shared/_shared.skill.md`
 */

import { database as db } from '@/server/services/database';
import {
  signAccessToken,
  signRefreshToken,
  getExpirationDate,
} from '@/lib/auth/jwt';
import type { UserRole, OrganizationRole } from '@/lib/auth/roles';
import { setAuthCookies } from './helpers';

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole | string;
  currentOrgId?: string | null;
  onboardingCompleted?: boolean | null;
};

export type IssueSessionOptions = {
  /** Organization role para o JWT (ex.: MASTER em signup, role da membership em login). */
  organizationRole?: OrganizationRole | null;
  /** Override do access token expiry. Default: usar o do `signAccessToken`. */
  accessTokenExpiry?: string;
  /** Override do refresh token expiry (ex.: '7d' | '30d'). Default: '7d'. */
  refreshTokenExpiry?: string;
};

export type IssueSessionResult = {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
};

/**
 * Emite tokens + persiste refresh + seta cookies.
 *
 * Padrão "criar placeholder → re-assinar com id → atualizar row" — garante que
 * o tokenId dentro do JWT bate com o id do registro no banco, permitindo
 * revogação granular no refresh.
 */
export async function issueSession(
  response: any,
  user: SessionUser,
  options: IssueSessionOptions = {},
): Promise<IssueSessionResult> {
  const accessToken = signAccessToken(
    {
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      currentOrgId: user.currentOrgId ?? undefined,
      organizationRole: options.organizationRole ?? undefined,
      needsOnboarding: !user.onboardingCompleted,
    },
    options.accessTokenExpiry,
  );

  // 1) Cria row com placeholder. O JWT temporário usa tokenId vazio só para
  //    poder gravar algo (a coluna `token` é NOT NULL).
  const placeholder = signRefreshToken({ userId: user.id, tokenId: '' });
  const refreshTokenData = await db.refreshToken.create({
    data: {
      userId: user.id,
      token: placeholder,
      expiresAt: getExpirationDate(options.refreshTokenExpiry ?? '7d'),
    },
  });

  // 2) Re-assina o refresh com o id real da row.
  const refreshToken = signRefreshToken({
    userId: user.id,
    tokenId: refreshTokenData.id,
  });

  // 3) Atualiza a row para guardar o JWT definitivo.
  await db.refreshToken.update({
    where: { id: refreshTokenData.id },
    data: { token: refreshToken },
  });

  setAuthCookies(response, accessToken, refreshToken);

  return { accessToken, refreshToken, refreshTokenId: refreshTokenData.id };
}
