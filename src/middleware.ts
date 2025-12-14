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
  '/forgot-password',
  '/reset-password',
  '/google-callback',
  '/verify',
];

/**
 * Rotas de onboarding (requerem autenticação mas não onboarding completo)
 */
const ONBOARDING_PATHS = ['/onboarding'];

/**
 * Rotas protegidas (requerem autenticação)
 */
const PROTECTED_PATHS = [
  '/integracoes',
  '/conversas',
  '/admin',
  '/dashboard',
  '/instances',
  '/organizations',
  '/projects',
  '/settings',
];

/**
 * Rotas que requerem role de System Admin
 */
const ADMIN_ONLY_PATHS = ['/admin'];

/**
 * Middleware principal
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Permitir rotas públicas sem autenticação
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // 2. Verificar se é rota protegida
  const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path));

  if (!isProtected) {
    return NextResponse.next();
  }

  // 3. Extrair token (cookie ou header Authorization)
  const cookieToken = request.cookies.get('accessToken')?.value;
  const headerToken = extractTokenFromHeader(request.headers.get('authorization') || '');
  const token = cookieToken || headerToken;

  // 4. Se não há token, redirecionar para login
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
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
    return response;
  }

  // 6. Verificar onboarding
  // Se usuário não completou onboarding E não está em rota de onboarding, redirecionar
  const isOnboardingPath = ONBOARDING_PATHS.some((path) => pathname.startsWith(path));

  if (payload.needsOnboarding && !isOnboardingPath) {
    // Usuário precisa completar onboarding
    const onboardingUrl = new URL('/onboarding', request.url);
    return NextResponse.redirect(onboardingUrl);
  }

  // Se usuário JÁ completou onboarding mas está na rota de onboarding, redirecionar para dashboard
  if (!payload.needsOnboarding && isOnboardingPath) {
    const dashboardUrl = new URL('/integracoes', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  // 7. Verificar se rota requer System Admin
  const isAdminOnlyPath = ADMIN_ONLY_PATHS.some((path) => pathname.startsWith(path));

  if (isAdminOnlyPath && !isSystemAdmin(payload.role as UserRole)) {
    // Usuário não é admin do sistema - redirecionar silenciosamente para a área do usuário
    const redirectUrl = new URL('/integracoes', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // 8. Adicionar informações do usuário aos headers (para uso em Server Components)
  const requestHeaders = new Headers(request.headers);
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

  // 9. Continuar com headers atualizados
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
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
