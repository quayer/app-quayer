/**
 * Session — CSRF routes
 *
 * Action: csrf (GET /csrf)
 * Gera e retorna um novo CSRF token via cookie.
 */

import { igniter } from '@/igniter';
import { generateCsrfToken, setCsrfCookie } from '@/lib/auth/csrf';

export const csrfRoutes = {
  /**
   * CSRF Token - Gera e retorna um novo CSRF token via cookie
   */
  csrf: igniter.query({
    name: 'Get CSRF Token',
    description: 'Generate a new CSRF token and set it as a cookie',
    path: '/csrf',
    method: 'GET',
    handler: async ({ response }) => {
      const csrfToken = generateCsrfToken();
      setCsrfCookie(response, csrfToken);
      return response.success({ token: csrfToken });
    },
  }),
};
