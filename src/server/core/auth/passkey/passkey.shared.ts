/**
 * Passkey — Shared helpers
 *
 * Config WebAuthn e schemas Zod compartilhados entre os módulos de rota.
 * Não exporta lógica de negócio — só primitivas reutilizáveis.
 */

import { z } from 'zod';

/**
 * Retorna rpId e origin a partir das variáveis de ambiente.
 * Em produção, lança se RP_ID ou NEXT_PUBLIC_APP_URL não estiverem definidos.
 */
export function getWebAuthnConfig() {
  const rpId = process.env.RP_ID;
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NODE_ENV === 'production' && (!rpId || !origin)) {
    throw new Error('[Security] RP_ID and NEXT_PUBLIC_APP_URL are required in production for WebAuthn');
  }
  return {
    rpId: rpId || 'localhost',
    origin: origin || 'http://localhost:3000',
  };
}

/** Schema mínimo de resposta de registro WebAuthn (payload completo repassado ao @simplewebauthn/server). */
export const webauthnRegistrationResponseSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  response: z.object({
    clientDataJSON: z.string(),
    attestationObject: z.string(),
    transports: z.array(z.string()).optional(),
  }).passthrough(),
  type: z.literal('public-key'),
  clientExtensionResults: z.record(z.any()).optional(),
  authenticatorAttachment: z.string().optional(),
}).passthrough();

/** Schema mínimo de resposta de autenticação WebAuthn. */
export const webauthnAuthenticationResponseSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  response: z.object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }).passthrough(),
  type: z.literal('public-key'),
  clientExtensionResults: z.record(z.any()).optional(),
  authenticatorAttachment: z.string().optional(),
}).passthrough();
