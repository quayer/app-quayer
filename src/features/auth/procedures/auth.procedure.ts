import { igniter } from "@/igniter";
import { AuthRepository } from "../repositories/auth.repository";
import { User } from "@prisma/client";
import { verifyAccessToken } from "@/lib/auth/jwt";
// IMPORTANT: Import directly from repository file to avoid circular dependency
// DO NOT import from @/features/api-keys index (it loads the controller which imports auth.procedure)
import { apiKeysRepository } from "@/features/api-keys/api-keys.repository";

/**
 * @typedef {object} AuthProcedureOptions
 * @property {boolean} [required=true] - Indica se autenticação é obrigatória para a rota
 */
type AuthProcedureOptions = {
  required?: boolean;
};

/**
 * Check if a token is an API key (starts with qk_)
 */
function isApiKey(token: string): boolean {
  return token.startsWith('qk_');
}

/**
 * Validate API key and return user context
 */
async function validateApiKeyAuth(apiKey: string, db: any, ip?: string): Promise<{
  valid: boolean;
  user?: any;
  scopes?: string[];
  error?: string;
}> {
  try {
    const result = await apiKeysRepository.validateKey(apiKey);

    if (!result.valid || !result.apiKey) {
      return { valid: false, error: result.reason || 'Invalid API key' };
    }

    // Update last used
    await apiKeysRepository.updateLastUsed(result.apiKey.id, ip).catch(() => {});

    // Get user from API key
    const user = await db.user.findUnique({
      where: { id: result.apiKey.userId },
      include: {
        organizations: {
          where: { isActive: true },
          include: { organization: true },
        },
      },
    });

    if (!user || !user.isActive) {
      return { valid: false, error: 'User not found or inactive' };
    }

    // Add organizationId from API key to user
    const userWithOrg = {
      ...user,
      organizationId: result.apiKey.organizationId,
      currentOrgId: result.apiKey.organizationId,
      isApiKeyAuth: true,
      apiKeyScopes: result.apiKey.scopes,
    };

    return {
      valid: true,
      user: userWithOrg,
      scopes: result.apiKey.scopes,
    };
  } catch (error) {
    console.error('[API Key Auth] Error:', error);
    return { valid: false, error: 'API key validation failed' };
  }
}

/**
 * @typedef {object} AuthContext
 * @property {object} auth - Contexto de autenticação
 * @property {object} auth.session - Sessão do usuário
 * @property {User | null} auth.session.user - Objeto do usuário autenticado ou null se não autenticado
 * @property {AuthRepository} auth.repository - Repository de autenticação
 */
type AuthContext = {
  auth: {
    session: {
      user: User | null;
    };
    repository: AuthRepository;
  };
};

/**
 * @function authProcedure
 * @description Procedure de autenticação que valida o token JWT e adiciona o usuário ao contexto
 *
 * Padrão Correto Igniter.js:
 * - Handler recebe (options, ctx) nesta ordem
 * - Retorna objeto diretamente para estender contexto
 * - NÃO usa next() para context extension
 */
export const authProcedure = igniter.procedure({
  name: "AuthProcedure",
  handler: async (options: AuthProcedureOptions = { required: true }, ctx): Promise<AuthContext | Response> => {
    const { request, response, context } = ctx;
    const { required = true } = options;

    // Extrair token do header Authorization ou Cookie
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
    const cookieHeader = request.headers.get("cookie") || "";

    // ✅ CORREÇÃO: Sempre extrair token do cookie para fallback
    let tokenFromCookie: string | null = null;
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim());
      const accessTokenCookie = cookies.find(c => c.startsWith('accessToken='));
      if (accessTokenCookie) {
        tokenFromCookie = accessTokenCookie.split('=')[1];
      }
    }

    // ✅ CORREÇÃO: Usar cookie como fallback se header existir mas for inválido
    let effectiveAuth = authHeader || (tokenFromCookie ? `Bearer ${tokenFromCookie}` : null);

    console.log('[AuthProcedure] authHeader:', authHeader ? 'present' : 'null');
    console.log('[AuthProcedure] tokenFromCookie:', tokenFromCookie ? 'present' : 'null');
    console.log('[AuthProcedure] required:', required);

    // Instanciar repository
    const authRepo = new AuthRepository(context.db);

    // Se não há auth (header ou cookie) e auth é obrigatória, retornar 401
    if (!effectiveAuth && required) {
      console.log('[AuthProcedure] No auth (header or cookie), auth required');
      return Response.json({ error: "Token não fornecido" }, { status: 401 });
    }

    // Se não há auth mas é opcional, retornar contexto com user null
    if (!effectiveAuth && !required) {
      console.log('[AuthProcedure] No auth, auth optional');
      return {
        auth: {
          session: {
            user: null,
          },
          repository: authRepo,
        },
      };
    }

    // Extrair token (de header Authorization ou de cookie já formatado)
    // Also check X-API-Key header for API key authentication
    const xApiKey = request.headers.get("x-api-key") || request.headers.get("X-API-Key");
    const token = xApiKey || (typeof effectiveAuth === 'string' && effectiveAuth.startsWith("Bearer ")
      ? effectiveAuth.slice(7)
      : effectiveAuth);

    console.log('[AuthProcedure] Token extracted:', token ? token.substring(0, 20) + '...' : 'null');

    // Get client IP for API key tracking
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || request.headers.get('x-real-ip')
      || 'unknown';

    try {
      // Check if this is an API key (starts with qk_)
      if (token && isApiKey(token)) {
        console.log('[AuthProcedure] Detected API key authentication');

        const apiKeyResult = await validateApiKeyAuth(token, context.db, clientIp);

        if (!apiKeyResult.valid) {
          if (required) {
            console.log('[AuthProcedure] Invalid API key:', apiKeyResult.error);
            return Response.json({ error: apiKeyResult.error || "API Key inválida" }, { status: 401 });
          }
          return {
            auth: {
              session: {
                user: null,
              },
              repository: authRepo,
            },
          };
        }

        // API Key authenticated successfully
        const user = apiKeyResult.user;
        console.log('[AuthProcedure] API Key authenticated:', user.email);

        // Adicionar headers de autenticação à request para uso em controllers
        request.headers.set('x-user-id', user.id);
        request.headers.set('x-user-role', user.role);
        request.headers.set('x-auth-type', 'api-key');
        if (user.currentOrgId) {
          request.headers.set('x-org-id', user.currentOrgId);
        }
        if (apiKeyResult.scopes) {
          request.headers.set('x-api-key-scopes', apiKeyResult.scopes.join(','));
        }

        return {
          auth: {
            session: {
              user: user as User,
            },
            repository: authRepo,
          },
        };
      }

      // JWT Token Authentication
      // Verificar JWT token
      let payload = await verifyAccessToken(token as string);

      console.log('[AuthProcedure] JWT payload:', payload);

      // ✅ CORREÇÃO: Se token do header for inválido, tentar o token do cookie
      if (!payload && tokenFromCookie && token !== tokenFromCookie) {
        console.log('[AuthProcedure] Header token invalid, trying cookie token');
        payload = await verifyAccessToken(tokenFromCookie);
        console.log('[AuthProcedure] Cookie JWT payload:', payload);
      }

      if (!payload) {
        if (required) {
          console.log('[AuthProcedure] Invalid JWT (both header and cookie), auth required');
          return Response.json({ error: "Token inválido" }, { status: 401 });
        }
        // Auth opcional e sem payload
        return {
          auth: {
            session: {
              user: null,
            },
            repository: authRepo,
          },
        };
      }

      // Buscar usuário no banco com suas organizações
      const user = await context.db.user.findUnique({
        where: { id: payload.userId },
        include: {
          organizations: {
            where: { isActive: true },
            include: { organization: true },
          },
        },
      });

      if (!user) {
        if (required) {
          console.log('[AuthProcedure] User not found');
          return Response.json({ error: "Usuário não encontrado" }, { status: 401 });
        }
        return {
          auth: {
            session: {
              user: null,
            },
            repository: authRepo,
          },
        };
      }

      // Verificar se usuário está ativo
      if (user.isActive === false) {
        console.log('[AuthProcedure] User inactive');
        if (required) {
          return Response.json({ error: "Usuário inativo" }, { status: 401 });
        }
        return {
          auth: {
            session: {
              user: null,
            },
            repository: authRepo,
          },
        };
      }

      // Adicionar organizationId do payload ao objeto user
      const userWithOrg = {
        ...user,
        organizationId: payload.currentOrgId,
        organizationRole: payload.organizationRole,
      };

      // Adicionar headers de autenticação à request para uso em controllers
      request.headers.set('x-user-id', user.id);
      request.headers.set('x-user-role', user.role);
      request.headers.set('x-auth-type', 'jwt');
      if (payload.currentOrgId) {
        request.headers.set('x-org-id', payload.currentOrgId);
      }
      if (payload.organizationRole) {
        request.headers.set('x-org-role', payload.organizationRole);
      }

      // Sucesso - retornar contexto com usuário
      console.log('[AuthProcedure] User authenticated:', user.email);
      return {
        auth: {
          session: {
            user: userWithOrg as User,
          },
          repository: authRepo,
        },
      };
    } catch (error) {
      console.error('[AuthProcedure] Error:', error);
      if (required) {
        return Response.json({ error: "Erro ao validar token" }, { status: 401 });
      }
      return {
        auth: {
          session: {
            user: null,
          },
          repository: authRepo,
        },
      };
    }
  },
});

/**
 * @function adminProcedure
 * @description Procedure que requer autenticação e role de admin
 */
export const adminProcedure = igniter.procedure({
  name: "AdminProcedure",
  handler: async (options: AuthProcedureOptions = { required: true }, ctx): Promise<AuthContext | Response> => {
    const { request, response, context } = ctx;

    // Extrair token do header Authorization ou Cookie
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
    const cookieHeader = request.headers.get("cookie") || "";

    // ✅ CORREÇÃO: Extrair token do cookie se não houver header Authorization
    let tokenFromCookie: string | null = null;
    if (!authHeader && cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim());
      const accessTokenCookie = cookies.find(c => c.startsWith('accessToken='));
      if (accessTokenCookie) {
        tokenFromCookie = accessTokenCookie.split('=')[1];
      }
    }

    const effectiveAuth = authHeader || (tokenFromCookie ? `Bearer ${tokenFromCookie}` : null);

    if (!effectiveAuth) {
      return Response.json({ error: "Token não fornecido" }, { status: 401 });
    }

    const token = typeof effectiveAuth === 'string' && effectiveAuth.startsWith("Bearer ")
      ? effectiveAuth.slice(7)
      : effectiveAuth;

    try {
      const authRepo = new AuthRepository(context.db);

      // Verificar JWT token
      const payload = await verifyAccessToken(token as string);

      if (!payload) {
        return Response.json({ error: "Token inválido" }, { status: 401 });
      }

      // Buscar usuário no banco
      const user = await context.db.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user) {
        return Response.json({ error: "Usuário não encontrado" }, { status: 401 });
      }

      if (user.isActive === false) {
        return Response.json({ error: "Usuário inativo" }, { status: 401 });
      }

      // Verificar se é admin
      if (user.role !== "admin") {
        return Response.json({ error: "Acesso negado: requer privilégios de administrador" }, { status: 403 });
      }

      // Adicionar organizationId do payload ao objeto user
      const userWithOrg = {
        ...user,
        organizationId: payload.currentOrgId,
        organizationRole: payload.organizationRole,
      };

      // Adicionar headers de autenticação à request para uso em controllers
      request.headers.set('x-user-id', user.id);
      request.headers.set('x-user-role', user.role);
      if (payload.currentOrgId) {
        request.headers.set('x-org-id', payload.currentOrgId);
      }
      if (payload.organizationRole) {
        request.headers.set('x-org-role', payload.organizationRole);
      }

      // Retornar contexto com usuário admin
      return {
        auth: {
          session: {
            user: userWithOrg as User,
          },
          repository: authRepo,
        },
      };
    } catch (error) {
      console.error('[AdminProcedure] Error:', error);
      return Response.json({ error: "Erro ao validar token" }, { status: 401 });
    }
  },
});
