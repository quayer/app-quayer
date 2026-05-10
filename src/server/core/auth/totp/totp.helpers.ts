/**
 * TOTP Helpers — internos ao subdominio totp.
 *
 * Exportados apenas para os routes files deste subdominio.
 * Nao exportar de fora do modulo auth/totp/.
 */

import { database as db } from '@/server/services/database';
import * as OTPAuth from 'otpauth';
import { decrypt, encrypt as _encrypt } from '@/lib/crypto';
import { hashPassword } from '@/lib/auth/bcrypt';

/** Verifica codigo TOTP (window +-1 passo = 90 seg de tolerancia). */
export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  try {
    const secret = decrypt(encryptedSecret);
    const totp = new OTPAuth.TOTP({
      issuer: process.env.APP_NAME || 'Quayer',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

/** Substitui todos os recovery codes do usuario por novos (ja hasheados). */
export async function replaceRecoveryCodes(userId: string, plainCodes: string[]): Promise<void> {
  await db.recoveryCode.deleteMany({ where: { userId } });
  const hashed = await Promise.all(
    plainCodes.map(async (code) => ({
      userId,
      code: await hashPassword(code),
    }))
  );
  await db.recoveryCode.createMany({ data: hashed });
}
