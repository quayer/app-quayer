import { igniter } from "@/igniter";
import { instancesProcedure } from "../procedures/instances.procedure";
import { authProcedure } from "@/features/auth/procedures/auth.procedure";
import {
  CreateInstanceSchema,
  UpdateInstanceSchema,
  ListInstancesQueryDTO,
  ErrorCode,
  BrokerType,
} from "../instances.interfaces";
import { uazapiService } from "@/lib/api/uazapi.service";
import { InstancesRepository } from "../repositories/instances.repository";
import { logger } from "@/services/logger";
import { validatePhoneNumber, formatWhatsAppNumber } from "@/lib/validators/phone.validator";

/**
 * Helper function to create structured error responses
 */
function createErrorResponse(code: ErrorCode, message: string, details?: any) {
  return {
    code,
    message,
    details,
    timestamp: new Date(),
  };
}

/**
 * Helper function to check organization permission
 */
function checkOrganizationPermission(
  instanceOrganizationId: string | null,
  userOrganizationId?: string
): boolean {
  if (!userOrganizationId) return false;
  return instanceOrganizationId === userOrganizationId;
}

export const instancesController = igniter.controller({
  name: "instances",
  path: "/instances",
  description: "Gerenciamento de instâncias WhatsApp com integração UAZapi",
  actions: {
    // ==================== CREATE ====================
    create: igniter.mutation({
      name: "CreateInstance",
      description: "Criar nova instância WhatsApp",
      path: "/",
      method: "POST",
      use: [authProcedure({ required: true }), instancesProcedure()],
      body: CreateInstanceSchema,
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { name, phoneNumber, brokerType, webhookUrl } = request.body;

        logger.info('Creating instance', {
          userId: context.auth?.session?.user?.id,
          organizationId: context.auth?.session?.user?.organizationId,
          instanceName: name,
        });

        try {
          // ✅ CORREÇÃO BRUTAL: Normalizar brokerType para uppercase para match com Prisma enum
          const normalizedBrokerType = brokerType
            ? (brokerType.toUpperCase() as BrokerType)
            : BrokerType.UAZAPI;

          logger.info('BrokerType normalized', {
            original: brokerType,
            normalized: normalizedBrokerType
          });

          // Business Rule: Validar número de telefone se fornecido
          let validatedPhoneNumber = phoneNumber;
          if (phoneNumber) {
            const phoneValidation = validatePhoneNumber(phoneNumber);
            if (!phoneValidation.isValid) {
              logger.warn('Invalid phone number', { phoneNumber, error: phoneValidation.error });
              return response.badRequest(`Número de telefone inválido: ${phoneValidation.error}`);
            }
            validatedPhoneNumber = phoneValidation.formatted; // Usar formato E.164
            logger.info('Phone number validated', { original: phoneNumber, formatted: validatedPhoneNumber });
          }

          // Business Rule: Verificar limite de instâncias da organização
          const organizationId = context.auth?.session?.user?.organizationId;
          if (organizationId) {
            const organization = await context.db.organization.findUnique({
              where: { id: organizationId },
              include: { connections: true } // ✅ CORRIGIDO: connections em vez de instances
            });

            if (organization && organization.connections.length >= organization.maxInstances) {
              logger.warn('Instance limit reached', {
                organizationId,
                currentInstances: organization.connections.length,
                maxInstances: organization.maxInstances
              });
              return response.badRequest(
                `Limite de instâncias atingido. Seu plano permite no máximo ${organization.maxInstances} instância(s).`
              );
            }
          }

          // Business Rule: Verificar se já existe instância com o mesmo nome na organização
          const existingInstance = await repository.findByName(name);
          if (existingInstance && existingInstance.organizationId === context.auth?.session?.user?.organizationId) {
            logger.warn('Instance name already exists', { name, organizationId: context.auth?.session?.user?.organizationId });
            return response.badRequest("Já existe uma instância com este nome na sua organização");
          }

          // Business Logic: Criar instância na UAZapi primeiro
          const uazapiResult = await uazapiService.createInstance(name, webhookUrl);

          if (!uazapiResult.success || !uazapiResult.data) {
            logger.error('UAZapi instance creation failed', { error: uazapiResult.error, name });
            return response.badRequest("Falha ao criar instância na UAZapi");
          }

          // Business Logic: Criar instância no banco de dados
          const instance = await repository.create({
            name,
            phoneNumber: validatedPhoneNumber,
            brokerType: normalizedBrokerType,
            webhookUrl,
            uazToken: uazapiResult.data.token,  // Fixed: Changed from uazapiToken to uazToken
            uazInstanceId: uazapiResult.data.instance?.id,  // Fixed: Changed from brokerId to uazInstanceId
            organizationId: context.auth?.session?.user?.organizationId || undefined,
          });

          logger.info('Instance created successfully', {
            instanceId: instance.id,
            userId: context.auth?.session?.user?.id
          });

          return response.created(instance);
        } catch (error) {
          logger.error('Failed to create instance', { error, userId: context.auth?.session?.user?.id });
          throw error;
        }
      },
    }),

    // ==================== LIST WITH PAGINATION ====================
    list: igniter.query({
      name: "ListInstances",
      description: "Listar instâncias WhatsApp com paginação e filtros",
      path: "/",
      use: [authProcedure({ required: true }), instancesProcedure()],
      query: ListInstancesQueryDTO,
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { page = 1, limit = 20, status = 'all', search } = request.query || {};

        logger.info('Listing instances', {
          userId: context.auth?.session?.user?.id,
          organizationId: context.auth?.session?.user?.organizationId,
          page,
          limit,
          status,
          search,
        });

        try {
          const result = await repository.findAllPaginated({
            organizationId: context.auth?.session?.user?.organizationId || undefined,
            page,
            limit,
            status: status === 'all' ? undefined : status,
            search,
          });

          return response.success({
            data: result.instances,
            pagination: {
              page,
              limit,
              total: result.total,
              totalPages: Math.ceil(result.total / limit),
            },
          });
        } catch (error) {
          logger.error('Failed to list instances', { error, userId: context.auth?.session?.user?.id });
          throw error;
        }
      },
    }),

    // ==================== GET BY ID WITH RBAC ====================
    getById: igniter.query({
      name: "GetInstanceById",
      description: "Buscar instância por ID",
      path: "/:id",
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };

        logger.info('Getting instance by ID', { instanceId: id, userId: context.auth?.session?.user?.id });

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            logger.warn('Instance not found', { instanceId: id });
            return response.notFound("Instância não encontrada");
          }

          // RBAC: Verificar permissão de organização
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.organizationId || undefined)) {
            logger.warn('Organization permission denied', {
              instanceId: id,
              userId: context.auth?.session?.user?.id,
              instanceOrg: instance.organizationId,
              userOrg: context.auth?.session?.user?.organizationId,
            });
            return response.forbidden("Você não tem permissão para acessar esta instância");
          }

          return response.success(instance);
        } catch (error) {
          logger.error('Failed to get instance', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== UPDATE WITH RBAC ====================
    update: igniter.mutation({
      name: "UpdateInstance",
      description: "Atualizar instância existente",
      path: "/:id",
      method: "PUT",
      use: [authProcedure({ required: true }), instancesProcedure()],
      body: UpdateInstanceSchema,
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };
        const updateData = request.body;

        logger.info('Updating instance', { instanceId: id, userId: context.auth?.session?.user?.id, updateData });

        try {
          const existingInstance = await repository.findById(id);

          if (!existingInstance) {
            return response.notFound("Instância não encontrada");
          }

          // RBAC: Verificar permissão de organização
          if (!checkOrganizationPermission(existingInstance.organizationId, context.auth?.session?.user?.organizationId || undefined)) {
            return response.forbidden("Você não tem permissão para atualizar esta instância");
          }

          const updatedInstance = await repository.update(id, updateData);

          logger.info('Instance updated successfully', { instanceId: id, userId: context.auth?.session?.user?.id });

          return response.success(updatedInstance);
        } catch (error) {
          logger.error('Failed to update instance', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== CONNECT WITH RBAC ====================
    connect: igniter.mutation({
      name: "ConnectInstance",
      description: "Conectar instância e gerar QR Code",
      path: "/:id/connect",
      method: "POST",
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };

        logger.info('Connecting instance', { instanceId: id, userId: context.auth?.session?.user?.id });

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // RBAC: Verificar permissão de organização
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.organizationId || undefined)) {
            return response.forbidden("Você não tem permissão para conectar esta instância");
          }

          if (instance.status === 'connected') {
            return response.badRequest("Instância já está conectada");
          }

          if (!instance.uazToken) {
            return response.badRequest("Instância não possui token da UAZapi");
          }

          const connectionResult = await uazapiService.connectInstance(instance.uazToken);

          if (!connectionResult.success || !connectionResult.data) {
            logger.error('UAZapi connection failed', { error: connectionResult.error, instanceId: id });
            return response.badRequest("Falha ao conectar instância");
          }

          if (!connectionResult.data.qrcode) {
            return response.badRequest("UAZapi não retornou QR Code válido");
          }

          await repository.updateQRCode(
            id,
            connectionResult.data.qrcode,
            connectionResult.data.pairingCode
          );

          logger.info('Instance connected successfully', { instanceId: id, userId: context.auth?.session?.user?.id });

          return response.success({
            qrcode: connectionResult.data.qrcode,
            expires: connectionResult.data.expires || 120000,
            pairingCode: connectionResult.data.pairingCode,
          });
        } catch (error) {
          logger.error('Failed to connect instance', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== GET STATUS WITH RBAC ====================
    getStatus: igniter.query({
      name: "GetInstanceStatus",
      description: "Verificar status da instância no UAZapi",
      path: "/:id/status",
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };

        logger.info('Getting instance status', { instanceId: id, userId: context.auth?.session?.user?.id });

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // RBAC: Verificar permissão de organização
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.organizationId || undefined)) {
            return response.forbidden("Você não tem permissão para verificar o status desta instância");
          }

          if (!instance.uazToken) {
            return response.badRequest("Instância não possui token da UAZapi");
          }

          const statusResult = await uazapiService.getInstanceStatus(instance.uazToken);

          if (!statusResult.success || !statusResult.data) {
            logger.error('Failed to get UAZapi status', { error: statusResult.error, instanceId: id });
            return response.badRequest("Falha ao verificar status");
          }

          // Atualizar status no banco se mudou
          if (statusResult.data.status !== instance.status) {
            await repository.updateStatus(
              id,
              statusResult.data.status,
              undefined,
              statusResult.data.phoneNumber
            );
          }

          return response.success(statusResult.data);
        } catch (error) {
          logger.error('Failed to get instance status', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== DISCONNECT WITH RBAC ====================
    disconnect: igniter.mutation({
      name: "DisconnectInstance",
      description: "Desconectar instância WhatsApp",
      path: "/:id/disconnect",
      method: "POST",
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };

        logger.info('Disconnecting instance', { instanceId: id, userId: context.auth?.session?.user?.id });

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // RBAC: Verificar permissão de organização
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.organizationId || undefined)) {
            return response.forbidden("Você não tem permissão para desconectar esta instância");
          }

          if (!instance.uazToken) {
            return response.badRequest("Instância não possui token da UAZapi");
          }

          const disconnectResult = await uazapiService.disconnectInstance(instance.uazToken);

          if (!disconnectResult.success) {
            logger.error('UAZapi disconnection failed', { error: disconnectResult.error, instanceId: id });
          }

          await repository.updateStatus(id, 'disconnected');
          await repository.clearQRCode(id);

          logger.info('Instance disconnected successfully', { instanceId: id, userId: context.auth?.session?.user?.id });

          return response.success({
            message: "Instância desconectada com sucesso",
          });
        } catch (error) {
          logger.error('Failed to disconnect instance', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== DELETE WITH RBAC ====================
    delete: igniter.mutation({
      name: "DeleteInstance",
      description: "Deletar instância e remover do UAZapi",
      path: "/:id",
      method: "DELETE",
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };

        logger.info('Deleting instance', { instanceId: id, userId: context.auth?.session?.user?.id });

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // RBAC: Verificar permissão de organização
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.organizationId || undefined)) {
            return response.forbidden("Você não tem permissão para deletar esta instância");
          }

          // Desconectar se estiver conectada
          if (instance.uazToken && (instance.status === 'connected' || instance.status === 'connecting')) {
            const disconnectResult = await uazapiService.disconnectInstance(instance.uazToken);
            if (!disconnectResult.success) {
              logger.warn('Failed to disconnect before delete', { instanceId: id, error: disconnectResult.error });
            }
          }

          // Deletar do UAZapi
          if (instance.uazToken) {
            const deleteResult = await uazapiService.deleteInstance(instance.uazToken);
            if (!deleteResult.success) {
              logger.warn('Failed to delete from UAZapi', { instanceId: id, error: deleteResult.error });
            }
          }

          // Deletar do banco de dados
          await repository.delete(id);

          logger.info('Instance deleted successfully', { instanceId: id, userId: context.auth?.session?.user?.id });

          return response.success({
            message: "Instância deletada com sucesso",
          });
        } catch (error) {
          logger.error('Failed to delete instance', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== GET PROFILE PICTURE ====================
    getProfilePicture: igniter.query({
      name: "GetInstanceProfilePicture",
      description: "Obter foto de perfil do WhatsApp conectado",
      path: "/:id/profile-picture",
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };

        logger.info('Fetching profile picture', { instanceId: id, userId: context.auth?.session?.user?.id });

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // RBAC: Verificar permissão de organização
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.organizationId || undefined)) {
            return response.forbidden("Você não tem permissão para acessar esta instância");
          }

          // Verificar se está conectada
          if (instance.status !== 'connected' || !instance.uazToken) {
            return response.badRequest("Instância não está conectada");
          }

          // Buscar foto de perfil do UAZapi
          const profileResult = await uazapiService.getProfilePicture(instance.uazToken);

          if (!profileResult.success || !profileResult.data) {
            logger.warn('Failed to get profile picture', { instanceId: id, error: profileResult.error });
            return response.badRequest("Falha ao obter foto de perfil");
          }

          // Atualizar no banco de dados
          if (profileResult.data.profilePictureUrl) {
            await repository.update(id, {
              profilePictureUrl: profileResult.data.profilePictureUrl
            });
          }

          return response.success({
            profilePictureUrl: profileResult.data.profilePictureUrl
          });
        } catch (error) {
          logger.error('Failed to get profile picture', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== SET WEBHOOK (ADMIN ONLY) ====================
    setWebhook: igniter.mutation({
      name: "SetInstanceWebhook",
      description: "Configurar webhook para eventos da instância (Admin/GOD apenas)",
      path: "/:id/webhook",
      method: "POST",
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };
        const { webhookUrl, events } = request.body as { webhookUrl: string; events: string[] };

        logger.info('Setting webhook', { instanceId: id, userId: context.auth?.session?.user?.id });

        // RBAC: Only admin or GOD role can configure webhooks
        const userRole = context.auth?.session?.user?.role;
        if (userRole !== 'admin') {
          return response.forbidden("Apenas administradores podem configurar webhooks");
        }

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // Verificar se está conectada
          if (!instance.uazToken) {
            return response.badRequest("Instância não possui token UAZapi");
          }

          // Configurar webhook no UAZapi
          const webhookResult = await uazapiService.setWebhook(
            instance.uazToken,
            webhookUrl,
            events
          );

          if (!webhookResult.success) {
            logger.warn('Failed to set webhook', { instanceId: id, error: webhookResult.error });
            return response.badRequest("Falha ao configurar webhook");
          }

          // Atualizar no banco de dados
          await repository.update(id, {
            webhookUrl,
            webhookEvents: events
          });

          logger.info('Webhook configured successfully', { instanceId: id, webhookUrl });

          return response.success({
            message: "Webhook configurado com sucesso",
            webhookUrl,
            events
          });
        } catch (error) {
          logger.error('Failed to set webhook', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== GET WEBHOOK (ADMIN ONLY) ====================
    getWebhook: igniter.query({
      name: "GetInstanceWebhook",
      description: "Obter configuração do webhook (Admin/GOD apenas)",
      path: "/:id/webhook",
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };

        logger.info('Getting webhook config', { instanceId: id, userId: context.auth?.session?.user?.id });

        // RBAC: Only admin or GOD role can view webhook configuration
        const userRole = context.auth?.session?.user?.role;
        if (userRole !== 'admin') {
          return response.forbidden("Apenas administradores podem visualizar configurações de webhook");
        }

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // Verificar se está conectada
          if (!instance.uazToken) {
            return response.badRequest("Instância não possui token UAZapi");
          }

          // Buscar configuração do webhook do UAZapi
          const webhookResult = await uazapiService.getWebhook(instance.uazToken);

          if (!webhookResult.success || !webhookResult.data) {
            logger.warn('Failed to get webhook config', { instanceId: id, error: webhookResult.error });
            return response.badRequest("Falha ao obter configuração do webhook");
          }

          return response.success({
            webhookUrl: webhookResult.data.webhookUrl || instance.webhookUrl,
            events: webhookResult.data.events || instance.webhookEvents || []
          });
        } catch (error) {
          logger.error('Failed to get webhook config', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== SHARE INSTANCE ====================
    share: igniter.mutation({
      name: "ShareInstance",
      description: "Gerar token de compartilhamento para instância",
      path: "/:id/share",
      method: "POST",
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };

        logger.info('Generating share token', { instanceId: id, userId: context.auth?.session?.user?.id });

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // Verificar se o usuário tem permissão para compartilhar esta instância
          const userOrgId = context.auth?.session?.user?.organizationId;
          if (!checkOrganizationPermission(instance.organizationId, userOrgId)) {
            return response.forbidden("Você não tem permissão para compartilhar esta instância");
          }

              // Gerar token de compartilhamento (expira em 1 hora)
              const shareToken = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

              // Salvar token no banco de dados usando o método específico
              await repository.updateShareToken(id, {
                shareToken,
                shareTokenExpiresAt: expiresAt
              });

          logger.info('Share token generated successfully', { instanceId: id, shareToken });

          return response.success({
            token: shareToken,
            expiresAt,
            shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/integracoes/compartilhar/${shareToken}`
          });
        } catch (error) {
          logger.error('Failed to generate share token', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== GET SHARED INSTANCE ====================
    getShared: igniter.query({
      name: "GetSharedInstance",
      description: "Obter dados de instância compartilhada via token",
      path: "/share/:token",
      use: [instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { token } = request.params as { token: string };

        logger.info('Getting shared instance data', { shareToken: token });

        try {
          // Buscar instância pelo token de compartilhamento
          const instance = await repository.findByShareToken(token);

          if (!instance) {
            return response.notFound("Token de compartilhamento inválido ou expirado");
          }

          // Verificar se o token não expirou
          if (instance.shareTokenExpiresAt && instance.shareTokenExpiresAt < new Date()) {
            return response.notFound("Token de compartilhamento expirado");
          }

          // Se a instância está conectada, buscar QR code atual
          let qrCode = null;
          if (instance.status === 'connected' && instance.uazToken) {
            try {
              const qrResult = await uazapiService.getQrCode(instance.uazToken);
              if (qrResult.success && qrResult.data?.qr) {
                qrCode = qrResult.data.qr;
              }
            } catch (error) {
              logger.warn('Failed to get QR code for shared instance', { error, instanceId: instance.id });
            }
          }

          logger.info('Shared instance data retrieved successfully', { instanceId: instance.id });

          return response.success({
            id: instance.id,
            name: instance.name,
            status: instance.status,
            phoneNumber: instance.phoneNumber,
            profileName: instance.profileName,
            qrCode,
            expiresAt: instance.shareTokenExpiresAt,
            organizationName: instance.organization?.name || 'Organização'
          });
        } catch (error) {
          logger.error('Failed to get shared instance data', { error, shareToken: token });
          throw error;
        }
      },
    }),

    // ==================== REFRESH SHARED QR CODE ====================
    refreshSharedQr: igniter.mutation({
      name: "RefreshSharedQrCode",
      description: "Atualizar QR code de instância compartilhada",
      path: "/share/:token/refresh",
      method: "POST",
      use: [instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { token } = request.params as { token: string };

        logger.info('Refreshing shared QR code', { shareToken: token });

        try {
          // Buscar instância pelo token de compartilhamento
          const instance = await repository.findByShareToken(token);

          if (!instance) {
            return response.notFound("Token de compartilhamento inválido ou expirado");
          }

          // Verificar se o token não expirou
          if (instance.shareTokenExpiresAt && instance.shareTokenExpiresAt < new Date()) {
            return response.notFound("Token de compartilhamento expirado");
          }

          // Se a instância não está conectada, tentar reconectar
          if (instance.status !== 'connected' && instance.uazToken) {
            try {
              const connectResult = await uazapiService.connectInstance(instance.uazToken);
              if (connectResult.success) {
                await repository.update(instance.id, { status: 'connecting' });
              }
            } catch (error) {
              logger.warn('Failed to reconnect shared instance', { error, instanceId: instance.id });
            }
          }

          // Buscar novo QR code
          let qrCode = null;
          if (instance.uazToken) {
            try {
              const qrResult = await uazapiService.getQrCode(instance.uazToken);
              if (qrResult.success && qrResult.data?.qr) {
                qrCode = qrResult.data.qr;
              }
            } catch (error) {
              logger.warn('Failed to get refreshed QR code', { error, instanceId: instance.id });
            }
          }

              // Estender expiração do token (mais 1 hora)
              const newExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
              await repository.updateShareToken(instance.id, {
                shareToken: instance.shareToken!,
                shareTokenExpiresAt: newExpiresAt
              });

          logger.info('Shared QR code refreshed successfully', { instanceId: instance.id });

          return response.success({
            qrCode,
            expiresAt: newExpiresAt
          });
        } catch (error) {
          logger.error('Failed to refresh shared QR code', { error, shareToken: token });
          throw error;
        }
      },
    }),

    // ==================== UPDATE PROFILE NAME ====================
    updateProfileName: igniter.mutation({
      name: "UpdateProfileName",
      description: "Atualizar nome do perfil WhatsApp",
      path: "/:id/profile/name",
      method: "PUT",
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };
        const { name } = request.body as { name: string };

        logger.info('Updating profile name', { instanceId: id, userId: context.auth?.session?.user?.id });

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // RBAC: Verificar permissão de organização
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.organizationId || undefined)) {
            return response.forbidden("Você não tem permissão para atualizar esta instância");
          }

          // Verificar se está conectada
          if (instance.status !== 'connected' || !instance.uazToken) {
            return response.badRequest("Instância não está conectada");
          }

          // Validar nome
          if (!name || name.trim().length === 0) {
            return response.badRequest("Nome é obrigatório");
          }

          if (name.length > 50) {
            return response.badRequest("Nome deve ter no máximo 50 caracteres");
          }

          // Atualizar nome via UAZapi
          const result = await uazapiService.updateProfileName(instance.uazToken, name.trim());

          // Atualizar no banco de dados
          await repository.update(id, {
            profileName: name.trim()
          });

          logger.info('Profile name updated successfully', { instanceId: id, newName: name });

          return response.success({
            message: "Nome do perfil atualizado com sucesso",
            profileName: name.trim()
          });
        } catch (error) {
          logger.error('Failed to update profile name', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== UPDATE PROFILE IMAGE ====================
    updateProfileImage: igniter.mutation({
      name: "UpdateProfileImage",
      description: "Atualizar foto do perfil WhatsApp",
      path: "/:id/profile/image",
      method: "PUT",
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };
        const { image } = request.body as { image: string };

        logger.info('Updating profile image', { instanceId: id, userId: context.auth?.session?.user?.id });

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // RBAC: Verificar permissão de organização
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.organizationId || undefined)) {
            return response.forbidden("Você não tem permissão para atualizar esta instância");
          }

          // Verificar se está conectada
          if (instance.status !== 'connected' || !instance.uazToken) {
            return response.badRequest("Instância não está conectada");
          }

          // Validar imagem (deve ser base64)
          if (!image || !image.startsWith('data:image/')) {
            return response.badRequest("Imagem inválida. Deve ser uma imagem em formato base64");
          }

          // Extrair apenas o base64 (remover data:image/...;base64,)
          const base64Image = image.split(',')[1];

          if (!base64Image) {
            return response.badRequest("Formato de imagem inválido");
          }

          // Atualizar imagem via UAZapi
          await uazapiService.updateProfileImage(instance.uazToken, base64Image);

          // Buscar a nova URL da foto de perfil
          const profileResult = await uazapiService.getProfilePicture(instance.uazToken);

          let profilePictureUrl = instance.profilePictureUrl;
          if (profileResult.success && profileResult.data?.profilePictureUrl) {
            profilePictureUrl = profileResult.data.profilePictureUrl;
          }

          // Atualizar no banco de dados
          await repository.update(id, {
            profilePictureUrl
          });

          logger.info('Profile image updated successfully', { instanceId: id });

          return response.success({
            message: "Foto do perfil atualizada com sucesso",
            profilePictureUrl
          });
        } catch (error) {
          logger.error('Failed to update profile image', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== RESTART INSTANCE ====================
    restart: igniter.mutation({
      name: "RestartInstance",
      description: "Reiniciar instância WhatsApp (desconecta e reconecta)",
      path: "/:id/restart",
      method: "POST",
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };

        logger.info('Restarting instance', { instanceId: id, userId: context.auth?.session?.user?.id });

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // RBAC: Verificar permissão de organização
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.organizationId || undefined)) {
            return response.forbidden("Você não tem permissão para reiniciar esta instância");
          }

          if (!instance.uazToken) {
            return response.badRequest("Instância não possui token da UAZapi");
          }

          // Desconectar primeiro
          logger.info('Disconnecting instance for restart', { instanceId: id });

          const disconnectResult = await uazapiService.disconnectInstance(instance.uazToken);

          if (!disconnectResult.success) {
            logger.warn('Failed to disconnect during restart', {
              instanceId: id,
              error: disconnectResult.error
            });
          }

          // Atualizar status
          await repository.updateStatus(id, 'disconnected');
          await repository.clearQRCode(id);

          // Aguardar 2 segundos para garantir desconexão
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Reconectar
          logger.info('Reconnecting instance after restart', { instanceId: id });

          const connectionResult = await uazapiService.connectInstance(instance.uazToken);

          if (!connectionResult.success || !connectionResult.data) {
            logger.error('Failed to reconnect during restart', {
              instanceId: id,
              error: connectionResult.error
            });
            return response.badRequest("Falha ao reconectar instância após reinício");
          }

          // Atualizar com novo QR code
          if (connectionResult.data.qrcode) {
            await repository.updateQRCode(
              id,
              connectionResult.data.qrcode,
              connectionResult.data.pairingCode
            );
          }

          logger.info('Instance restarted successfully', { instanceId: id });

          return response.success({
            message: "Instância reiniciada com sucesso",
            qrcode: connectionResult.data.qrcode,
            expires: connectionResult.data.expires || 120000,
            pairingCode: connectionResult.data.pairingCode,
          });
        } catch (error) {
          logger.error('Failed to restart instance', { error, instanceId: id });
          throw error;
        }
      },
    }),
  },
});
