/**
 * Auth TOTP/2FA Controller
 *
 * Thin composition of 3 route modules:
 *   - setup.routes:   totpSetup + totpVerify + totpDevices
 *   - disable.routes: totpDisableRequest + totpDisable + totpRegenerateCodes
 *   - login.routes:   twoFactorLoginVerify (emite sessao pos-2FA)
 *
 * Regra: este arquivo so COMPOE rotas — qualquer logica vive nos handlers.
 * Contexto completo em ./totp.skill.md
 *
 * Endpoints:
 *   POST /auth/totp/setup              — gera secret + QR code, cria TotpDevice pendente
 *   POST /auth/totp/verify             — verifica codigo TOTP e ativa o device
 *   GET  /auth/totp/devices            — lista devices ativos do usuario
 *   POST /auth/totp/disable-request    — envia email com codigo para desativar
 *   POST /auth/totp/disable            — desativa 2FA (requer emailCode + totpCode)
 *   POST /auth/totp/regenerate-codes   — regenera recovery codes
 *   POST /auth/2fa/verify              — (H-5) completa login 2FA apos primeiro fator
 */

import { igniter } from '@/igniter';
import { setupRoutes } from './setup.routes';
import { disableRoutes } from './disable.routes';
import { loginRoutes } from './login.routes';

export const totpController = igniter.controller({
  name: 'auth-totp',
  path: '/auth',
  description: 'TOTP/2FA management endpoints',
  actions: {
    ...setupRoutes,
    ...disableRoutes,
    ...loginRoutes,
  },
});
