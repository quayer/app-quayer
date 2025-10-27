import { igniter } from "@/igniter";
import { AuthRepository } from "../repositories/auth.repository";
import { User } from "@prisma/client";
import { verifyAccessToken } from "@/lib/auth/jwt";

/**
 * @typedef {object} AuthProcedureOptions
 * @property {boolean} [required=true] - Indica se autenticação é obrigatória para a rota
 */
type AuthProcedureOptions = {
  required?: boolean;
};

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

    // Extrair token do header Authorization usando .get()
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");

    console.log('[AuthProcedure] authHeader:', authHeader);
    console.log('[AuthProcedure] required:', required);

    // Instanciar repository
    const authRepo = new AuthRepository(context.db);

    // Se não há header e auth é obrigatória, retornar 401
    if (!authHeader && required) {
      console.log('[AuthProcedure] No auth header, auth required');
      return Response.json({ error: "Token não fornecido" }, { status: 401 });
    }

    // Se não há header mas auth é opcional, retornar contexto com user null
    if (!authHeader && !required) {
      console.log('[AuthProcedure] No auth header, auth optional');
      return {
        auth: {
          session: {
            user: null,
          },
          repository: authRepo,
        },
      };
    }

    // Extrair token
    const token = typeof authHeader === 'string' && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    console.log('[AuthProcedure] Token extracted:', token ? token.substring(0, 20) + '...' : 'null');

    try {
      // Verificar JWT token
      const payload = await verifyAccessToken(token as string);

      console.log('[AuthProcedure] JWT payload:', payload);

      if (!payload) {
        if (required) {
          console.log('[AuthProcedure] Invalid JWT, auth required');
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

    // Extrair token do header Authorization usando .get()
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");

    if (!authHeader) {
      return Response.json({ error: "Token não fornecido" }, { status: 401 });
    }

    const token = typeof authHeader === 'string' && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

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
