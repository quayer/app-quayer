import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';

/**
 * Files Controller
 *
 * Gerenciamento de arquivos (upload, download, listagem)
 *
 * Rotas:
 * - POST /api/files/upload - Upload de arquivo (base64)
 * - GET  /api/files/:id    - Buscar/Baixar arquivo
 * - GET  /api/files        - Listar arquivos
 */
export const filesController = igniter.controller({
  name: 'files',
  description: 'Gerenciamento de arquivos e uploads',

  actions: {
    /**
     * POST /api/files/upload
     * Upload de arquivo (via base64 ou URL)
     *
     * Note: Para produção, deve usar S3/CDN real
     * Esta implementação usa base64 ou URL para simplicidade
     */
    upload: igniter.mutation({
      path: '/upload',
      method: 'POST',
      body: z.object({
        fileName: z.string().min(1),
        mimeType: z.string(),
        fileSize: z.number().int().min(0),
        url: z.string().optional(), // URL externa ou base64
        data: z.string().optional(), // Base64 data
        metadata: z.record(z.any()).optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { fileName, mimeType, fileSize, url, data, metadata } = context.body;
        const { user, currentOrgId } = context.user;

        // Validar que pelo menos URL ou data foi fornecido
        if (!url && !data) {
          return response.error({
            message: 'É necessário fornecer "url" ou "data" (base64)',
            status: 400,
          });
        }

        // Em produção, aqui você faria:
        // 1. Upload para S3/R2/MinIO
        // 2. Gerar thumbnail se for imagem
        // 3. Processar metadata (dimensões, duração)
        // Por enquanto, usamos o que foi fornecido

        const finalUrl = url || `data:${mimeType};base64,${data}`;

        const file = await database.file.create({
          data: {
            organizationId: currentOrgId,
            userId: user.userId,
            fileName,
            fileSize,
            mimeType,
            url: finalUrl,
            metadata: metadata || null,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        return response.success({
          data: file,
          message: 'Arquivo enviado com sucesso',
        });
      },
    }),

    /**
     * GET /api/files/:id
     * Buscar/Baixar arquivo
     */
    getById: igniter.query({
      path: '/:id',
      params: z.object({
        id: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { currentOrgId } = context.user;

        const file = await database.file.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        if (!file) {
          return response.error({
            message: 'Arquivo não encontrado',
            status: 404,
          });
        }

        return response.success({
          data: file,
        });
      },
    }),

    /**
     * GET /api/files
     * Listar arquivos
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(20),
        mimeType: z.string().optional(), // Filtrar por tipo
        search: z.string().optional(), // Buscar por nome
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { page, limit, mimeType, search } = context.query;
        const { currentOrgId } = context.user;

        const where: any = {
          organizationId: currentOrgId,
        };

        if (mimeType) {
          where.mimeType = { contains: mimeType };
        }

        if (search) {
          where.fileName = { contains: search, mode: 'insensitive' };
        }

        const [files, total] = await Promise.all([
          database.file.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          }),
          database.file.count({ where }),
        ]);

        return response.success({
          data: files,
          pagination: {
            total_data: total,
            total_pages: Math.ceil(total / limit),
            page,
            limit,
          },
        });
      },
    }),

    /**
     * DELETE /api/files/:id
     * Deletar arquivo
     */
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      params: z.object({
        id: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { user, currentOrgId } = context.user;

        const file = await database.file.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!file) {
          return response.error({
            message: 'Arquivo não encontrado',
            status: 404,
          });
        }

        // Verificar se é o dono ou admin
        if (file.userId !== user.userId && user.role !== 'admin') {
          return response.error({
            message: 'Você não tem permissão para deletar este arquivo',
            status: 403,
          });
        }

        // Em produção, aqui deletaria do S3/CDN também

        await database.file.delete({
          where: { id },
        });

        return response.success({
          message: 'Arquivo deletado com sucesso',
        });
      },
    }),
  },
});
