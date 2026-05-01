/**
 * Next.js Middleware - Authentication & Authorization
 *
 * Protege rotas, valida JWT tokens e verifica permissões
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAccessToken, extractTokenFromHeader } from '@/lib/auth/jwt.edge';
import { UserRole, isSystemAdmin } from '@/lib/auth/roles';

/**
 * Rotas públicas (não requerem autenticação)
 */
const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/connect',
  '/compartilhar',
  '/google-callback',
  '/verify',
];

/**
 * Rotas de onboarding (requerem autenticação mas não onboarding completo)
 */
const ONBOARDING_PATHS = ['/onboarding'];

/**
 * Rotas protegidas (requerem autenticação)
 *
 * Nota: a rota raiz `/` (home nova do Builder) é tratada separadamente
 * abaixo porque `startsWith('/')` daria match em tudo.
 */
const PROTECTED_PATHS = [
  '/projetos',
  '/canais',
  '/admin',
  '/conta',
  '/org',
  '/dashboard',
  '/docs',
  '/instances',
  '/organizations',
  '/projects',
  '/settings',
  '/user',
  '/onboarding',
  '/auth/device',
];

/**
 * Rotas que requerem role de System Admin
 */
const ADMIN_ONLY_PATHS = ['/admin', '/docs'];

/**
 * Builds a per-request Content-Security-Policy header value.
 * The nonce eliminates the need for 'unsafe-inline' in script-src.
 */
function buildCSP(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://o4508515203874816.ingest.de.sentry.io https://challenges.cloudflare.com",
    "frame-src 'self' https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Middleware principal
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 0. Strip all sensitive headers unconditionally — before ANY branching.
  //    This prevents attacker-controlled request headers from reaching downstream
  //    Server Components or Route Handlers regardless of which path is taken.
  const SENSITIVE_HEADERS = [
    'x-user-id',
    'x-user-email',
    'x-user-role',
    'x-needs-onboarding',
    'x-current-org-id',
    'x-organization-role',
    'x-org-id',
    'x-org-role',
  ] as const;

  const requestHeaders = new Headers(request.headers);
  SENSITIVE_HEADERS.forEach((h) => requestHeaders.delete(h));

  // Generate per-request nonce for CSP (available in Edge runtime without imports)
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  requestHeaders.set('x-nonce', nonce);

  // 1. Permitir rotas públicas sem autenticação
  // startsWith sozinho daria match em prefixos parciais (ex: '/login' matcharia
  // '/login-admin'). Verificamos o separador de segmento para evitar bypass.
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'))) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', buildCSP(nonce));
    return response;
  }

  // 2. Verificar se é rota protegida
  // Match exato em `/` (home nova do Builder) OU startsWith nas demais
  const isRoot = pathname === '/';
  const isProtected =
    isRoot ||
    PROTECTED_PATHS.some((path) => pathname.startsWith(path));

  if (!isProtected) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', buildCSP(nonce));
    return response;
  }

  // 3. Extrair token (cookie ou header Authorization)
  const cookieToken = request.cookies.get('accessToken')?.value;
  const headerToken = extractTokenFromHeader(request.headers.get('authorization') || '');
  const token = cookieToken || headerToken;

  // 4. Se não há token, redirecionar para login
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    // Preservar query params na URL de redirect (ex: /auth/device?code=ABCD-1234)
    const search = request.nextUrl.search;
    loginUrl.searchParams.set('redirect', search ? `${pathname}${search}` : pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 5. Verificar e decodificar token
  const payload = await verifyAccessToken(token);

  if (!payload) {
    // Token inválido ou expirado
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    loginUrl.searchParams.set('error', 'session_expired');

    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('accessToken'); // Limpar cookie inválido
    response.cookies.delete('refreshToken');
    return response;
  }

  // 6. [IP check removido do middleware — Edge runtime não pode fazer fetch bloqueante]
  // IP blocking é aplicado na camada de API quando necessário.

  // 7. Verificar onboarding
  // Se usuário não completou onboarding E não está em rota de onboarding, redirecionar
  const isOnboardingPath = ONBOARDING_PATHS.some((path) => pathname.startsWith(path));

  if (payload.needsOnboarding && !isOnboardingPath) {
    // Usuário precisa completar onboarding
    const onboardingUrl = new URL('/onboarding', request.url);
    return NextResponse.redirect(onboardingUrl);
  }

  // Se usuário JÁ completou onboarding mas está na rota de onboarding, redirecionar para home
  if (!payload.needsOnboarding && isOnboardingPath) {
    const dashboardUrl = new URL('/', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  // 8. Verificar se rota requer System Admin
  const isAdminOnlyPath = ADMIN_ONLY_PATHS.some((path) => pathname.startsWith(path));

  if (isAdminOnlyPath && !isSystemAdmin(payload.role as UserRole)) {
    // Usuário não é admin do sistema - redirecionar silenciosamente para a home
    const redirectUrl = new URL('/', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // 9. Adicionar informações do usuário aos headers (para uso em Server Components)
  // IMPORTANTE: estes headers são gerados AQUI a partir do JWT verificado.
  // Route Handlers e Server Components NUNCA devem usá-los como fonte primária
  // de autenticação — sempre revalidar via JWT ou session no handler. Eles
  // existem apenas como conveniência de leitura para Server Components que já
  // estão atrás desta camada de middleware.
  // NOTE: requestHeaders was already created at step 0 with sensitive headers stripped.
  requestHeaders.set('x-user-id', payload.userId);
  requestHeaders.set('x-user-email', payload.email);
  requestHeaders.set('x-user-role', payload.role);

  if (payload.needsOnboarding !== undefined) {
    requestHeaders.set('x-needs-onboarding', String(payload.needsOnboarding));
  }

  if (payload.currentOrgId) {
    requestHeaders.set('x-current-org-id', payload.currentOrgId);
  }

  if (payload.organizationRole) {
    requestHeaders.set('x-organization-role', payload.organizationRole);
  }

  // 10. Continuar com headers atualizados
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set('Content-Security-Policy', buildCSP(nonce));
  return response;
}

/**
 * Configuração do matcher
 * Define quais rotas o middleware deve processar
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes - tem sua própria autenticação)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
  ],
};
