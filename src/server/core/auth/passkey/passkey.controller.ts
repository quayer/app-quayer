/**
 * Auth WebAuthn passkey flows — controller composer
 *
 * Thin composition of 3 route modules:
 *   register.routes   → passkeyRegisterOptions, passkeyRegisterVerify, passkeyList, passkeyDelete
 *   login.routes      → passkeyLoginOptions, passkeyLoginVerify
 *   conditional.routes→ passkeyConditionalChallenge, passkeyConditionalVerify
 *
 * Nenhuma lógica de negócio aqui — cada módulo é responsável pelo seu domínio.
 * Contratos de response e action names preservados integralmente.
 * Ver passkey.skill.md para documentação completa do subdomínio.
 */

import { igniter } from '@/igniter';
import { registerRoutes }    from './register.routes';
import { loginRoutes }       from './login.routes';
import { conditionalRoutes } from './conditional.routes';

export const passkeyController = igniter.controller({
  name: 'auth-passkey',
  path: '/auth',
  description: 'Auth WebAuthn passkey flows',
  actions: {
    ...registerRoutes,
    ...loginRoutes,
    ...conditionalRoutes,
  },
});
