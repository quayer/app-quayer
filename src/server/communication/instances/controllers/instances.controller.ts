import { igniter } from "@/igniter";
import { z } from "zod";
import { instancesProcedure } from "../procedures/instances.procedure";
import { authOrApiKeyProcedure } from "@/server/core/auth/procedures/api-key.procedure";
import {
  CreateInstanceSchema,
  UpdateInstanceSchema,
  UpdateCredentialsSchema,
  ListInstancesQueryDTO,
  ErrorCode,
  BrokerType,
} from "../instances.interfaces";

const META_GRAPH_VERSION = 'v20.0'

/**
 * Valida credenciais CloudAPI contra a Meta Graph API.
 * Retorna { valid: true, displayPhone, verifiedName } ou { valid: false, error }.
 */
async function validateCloudApiCredentials(
  accessToken: string,
  phoneNumberId: string,
): Promise<{ valid: true; displayPhone?: string; verifiedName?: string } | { valid: false; error: string }> {
  try {
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}`)
    url.searchParams.set('fields', 'id,display_phone_number,verified_name')
    url.searchParams.set('access_token', accessToken)

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    const data = await res.json().catch(() => ({})) as Record<string, unknown>

    if (!res.ok) {
      const errMsg = (data?.error as Record<string, unknown>)?.message as string | undefined
      return { valid: false, error: errMsg || 'Credenciais inválidas' }
    }

    return {
      valid: true,
      displayPhone: data.display_phone_number as string | undefined,
      verifiedName: data.verified_name as string | undefined,
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    return { valid: false, error: isTimeout ? 'Tempo limite ao contatar a Meta API' : 'Erro ao validar credenciais' }
  }
}

/**
 * Valida credenciais Instagram contra a Meta Graph API.
 */
async function validateInstagramCredentials(
  accessToken: string,
  instagramAccountId: string,
): Promise<{ valid: true; username?: string; name?: string } | { valid: false; error: string }> {
  try {
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(instagramAccountId)}`)
    url.searchParams.set('fields', 'name,username')
    url.searchParams.set('access_token', accessToken)

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    const data = await res.json().catch(() => ({})) as Record<string, unknown>

    if (!res.ok) {
      const errMsg = (data?.error as Record<string, unknown>)?.message as string | undefined
      return { valid: false, error: errMsg || 'Credenciais inválidas' }
    }

    return { valid: true, username: data.username as string | undefined, name: data.name as string | undefined }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    return { valid: false, error: isTimeout ? 'Tempo limite ao contatar a Meta API' : 'Erro ao validar credenciais' }
  }
}
import { uazapiService } from "@/lib/api/uazapi.service";
import { orchestrator } from "@/lib/providers";
import { InstancesRepository } from "../repositories/instances.repository";
import { logger } from "@/server/services/logger";
import { validatePhoneNumber, formatWhatsAppNumber } from "@/lib/validators/phone.validator";
import { connectionNotificationsService } from "@/lib/notifications/connection-notifications.service";

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
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
      body: CreateInstanceSchema,
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { name, phoneNumber, brokerType, webhookUrl } = request.body;

        logger.info('Creating instance', {
          userId: context.auth?.session?.user?.id,
          organizationId: context.auth?.session?.user?.currentOrgId,
          instanceName: name,
        });

        try {
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
          const organizationId = context.auth?.session?.user?.currentOrgId;
          if (organizationId) {
            const organization = await context.db.organization.findUnique({
              where: { id: organizationId },
              include: { connections: true }
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
          if (existingInstance && existingInstance.organizationId === context.auth?.session?.user?.currentOrgId) {
            logger.warn('Instance name already exists', { name, organizationId: context.auth?.session?.user?.currentOrgId });
            return response.badRequest("Já existe uma instância com este nome na sua organização");
          }

          const resolvedBrokerType = brokerType || BrokerType.UAZAPI;
          const { accessToken, phoneNumberId, wabaId, instagramAccountId, pageId } = request.body;

          let instance;

          if (resolvedBrokerType === BrokerType.CLOUDAPI) {
            // CloudAPI: salvar credenciais diretamente, sem chamar UAZapi
            if (!accessToken || !phoneNumberId || !wabaId) {
              return response.badRequest(
                "CloudAPI requer accessToken, phoneNumberId e wabaId"
              );
            }

            const cloudValidation = await validateCloudApiCredentials(accessToken, phoneNumberId);
            if (!cloudValidation.valid) {
              return response.badRequest(`Credenciais CloudAPI inválidas: ${cloudValidation.error}`);
            }

            instance = await repository.create({
              name,
              phoneNumber: validatedPhoneNumber,
              brokerType: resolvedBrokerType,
              webhookUrl,
              organizationId: context.auth?.session?.user?.currentOrgId || undefined,
              cloudApiAccessToken: accessToken,
              cloudApiPhoneNumberId: phoneNumberId,
              cloudApiWabaId: wabaId,
              status: 'CONNECTED',
            } as any);

            logger.info('CloudAPI instance created', { instanceId: instance.id, phoneNumberId });
          } else if (resolvedBrokerType === BrokerType.INSTAGRAM) {
            // Instagram: salvar credenciais diretamente, sem chamar UAZapi
            if (!accessToken || !instagramAccountId) {
              return response.badRequest(
                "Instagram requer accessToken e instagramAccountId"
              );
            }

            const igValidation = await validateInstagramCredentials(accessToken, instagramAccountId);
            if (!igValidation.valid) {
              return response.badRequest(`Credenciais Instagram inválidas: ${igValidation.error}`);
            }

            instance = await repository.create({
              name,
              phoneNumber: validatedPhoneNumber,
              brokerType: resolvedBrokerType,
              webhookUrl,
              organizationId: context.auth?.session?.user?.currentOrgId || undefined,
              cloudApiAccessToken: accessToken,
              cloudApiPhoneNumberId: instagramAccountId,
              cloudApiWabaId: pageId || null,
              status: 'CONNECTED',
            } as any);

            logger.info('Instagram instance created', { instanceId: instance.id, instagramAccountId });
          } else {
            // UAZAPI (default): criar instância na UAZapi primeiro
            const uazapiResult = await uazapiService.createInstance(name, webhookUrl);

            if (!uazapiResult.success || !uazapiResult.data) {
              logger.error('UAZapi instance creation failed', { error: uazapiResult.error, name });
              return response.badRequest("Falha ao criar instância na UAZapi");
            }

            instance = await repository.create({
              name,
              phoneNumber: validatedPhoneNumber,
              brokerType: resolvedBrokerType,
              webhookUrl,
              uazapiToken: uazapiResult.data.token,
              brokerId: uazapiResult.data.instance?.id,
              organizationId: context.auth?.session?.user?.currentOrgId || undefined,
            });
          }

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
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
      query: ListInstancesQueryDTO,
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { page = 1, limit = 20, status = 'all', search } = request.query || {};

        logger.info('Listing instances', {
          userId: context.auth?.session?.user?.id,
          organizationId: context.auth?.session?.user?.currentOrgId,
          page,
          limit,
          status,
          search,
        });

        try {
          const result = await repository.findAllPaginated({
            organizationId: context.auth?.session?.user?.currentOrgId || undefined,
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
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined)) {
            logger.warn('Organization permission denied', {
              instanceId: id,
              userId: context.auth?.session?.user?.id,
              instanceOrg: instance.organizationId,
              userOrg: context.auth?.session?.user?.currentOrgId,
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
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
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
          if (!checkOrganizationPermission(existingInstance.organizationId, context.auth?.session?.user?.currentOrgId || undefined)) {
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
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
      body: z.object({ phone: z.string().min(8).optional(), forceReconnect: z.boolean().optional() }),
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };
        const body = request.body as { phone?: string; forceReconnect?: boolean } | undefined
        const phone = body?.phone?.trim() || undefined
        const forceReconnect = body?.forceReconnect ?? false

        logger.info('Connecting instance', { instanceId: id, userId: context.auth?.session?.user?.id });

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // RBAC: Verificar permissão de organização
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined)) {
            return response.forbidden("Você não tem permissão para conectar esta instância");
          }

          if (instance.status === 'CONNECTED' && !forceReconnect) {
            return response.badRequest("Instância já está conectada");
          }

          // Detectar o brokerType a partir dos campos da instância
          const resolvedBrokerType = (instance as any).brokerType as BrokerType | undefined;
          const isCloudApi = resolvedBrokerType === BrokerType.CLOUDAPI
            || instance.provider === 'WHATSAPP_CLOUD_API';
          const isInstagram = resolvedBrokerType === BrokerType.INSTAGRAM
            || instance.provider === 'INSTAGRAM_META';

          if (isCloudApi || isInstagram) {
            // CloudAPI / Instagram: sem QR — validar via health check do provider
            const providerKey: 'cloudapi' | 'instagram' = isInstagram ? 'instagram' : 'cloudapi';

            try {
              const healthy = await orchestrator.healthCheck(providerKey);

              if (!healthy) {
                return response.badRequest("Provider não está disponível");
              }

              await repository.updateStatus(id, 'CONNECTED');

              logger.info('Cloud/Instagram instance validated', { instanceId: id, provider: providerKey });

              // Notificar organização que instância conectou
              connectionNotificationsService.notifyConnected({
                connectionId: id,
                connectionName: instance.name,
                organizationId: instance.organizationId,
              }).catch(() => {/* non-blocking */});

              return response.success({
                connected: true,
                provider: providerKey,
                message: 'Instância validada com sucesso. Não é necessário QR Code para este provider.',
              });
            } catch (error) {
              logger.error('Cloud/Instagram health check failed', { error, instanceId: id });
              return response.badRequest("Falha ao validar provider");
            }
          }

          if (!instance.uazapiToken) {
            return response.badRequest("Instância não possui token da UAZapi");
          }

          const connectionResult = await uazapiService.connectInstance(instance.uazapiToken, phone)

          if (!connectionResult.success || !connectionResult.data) {
            logger.error('UAZapi connection failed', { error: connectionResult.error, instanceId: id })
            return response.badRequest("Falha ao conectar instância")
          }

          if (phone) {
            const pairingCode = connectionResult.data.pairingCode
            if (!pairingCode) {
              return response.badRequest("UAZapi não retornou pairing code para o número informado")
            }
            return response.success({
              qrcode: null,
              expires: connectionResult.data.expires || 120000,
              pairingCode,
            })
          }

          if (!connectionResult.data.qrcode) {
            return response.badRequest("UAZapi não retornou QR Code válido")
          }

          await repository.updateQRCode(
            id,
            connectionResult.data.qrcode,
            connectionResult.data.pairingCode
          )

          logger.info('Instance connected successfully', { instanceId: id, userId: context.auth?.session?.user?.id })

          return response.success({
            qrcode: connectionResult.data.qrcode,
            expires: connectionResult.data.expires || 120000,
            pairingCode: connectionResult.data.pairingCode,
          })
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
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined)) {
            return response.forbidden("Você não tem permissão para verificar o status desta instância");
          }

          // Detectar o brokerType a partir dos campos da instância
          const resolvedBrokerTypeForStatus = (instance as any).brokerType as BrokerType | undefined;
          const isCloudApiStatus = resolvedBrokerTypeForStatus === BrokerType.CLOUDAPI
            || instance.provider === 'WHATSAPP_CLOUD_API';
          const isInstagramStatus = resolvedBrokerTypeForStatus === BrokerType.INSTAGRAM
            || instance.provider === 'INSTAGRAM_META';

          if (isCloudApiStatus || isInstagramStatus) {
            // CloudAPI / Instagram: retornar status do banco com health check
            const providerKey: 'cloudapi' | 'instagram' = isInstagramStatus ? 'instagram' : 'cloudapi';

            let healthy = false;
            try {
              healthy = await orchestrator.healthCheck(providerKey);
            } catch {
              healthy = false;
            }

            return response.success({
              status: instance.status,
              provider: providerKey,
              healthy,
              phoneNumber: instance.phoneNumber,
              profileName: instance.profileName,
            });
          }

          if (!instance.uazapiToken) {
            return response.badRequest("Instância não possui token da UAZapi");
          }

          const statusResult = await uazapiService.getInstanceStatus(instance.uazapiToken);

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

            // Notificar sobre mudança de status
            const newStatus = statusResult.data.status;
            if (newStatus === 'CONNECTED' && instance.status !== 'CONNECTED') {
              connectionNotificationsService.notifyConnected({
                connectionId: id,
                connectionName: instance.name,
                organizationId: instance.organizationId,
              }).catch(() => {/* non-blocking */});
            } else if (newStatus === 'DISCONNECTED' && instance.status === 'CONNECTED') {
              connectionNotificationsService.notifyConnectionLost({
                connectionId: id,
                connectionName: instance.name,
                organizationId: instance.organizationId,
                previousStatus: instance.status,
              }).catch(() => {/* non-blocking */});
            }
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
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined)) {
            return response.forbidden("Você não tem permissão para desconectar esta instância");
          }

          if (!instance.uazapiToken) {
            return response.badRequest("Instância não possui token da UAZapi");
          }

          const disconnectResult = await uazapiService.disconnectInstance(instance.uazapiToken);

          if (!disconnectResult.success) {
            logger.error('UAZapi disconnection failed', { error: disconnectResult.error, instanceId: id });
          }

          await repository.updateStatus(id, 'DISCONNECTED');
          await repository.clearQRCode(id);

          // Notificar organização sobre desconexão
          connectionNotificationsService.notifyDisconnection({
            connectionId: id,
            connectionName: instance.name,
            organizationId: instance.organizationId,
            reason: 'Desconexão manual pelo usuário',
          }).catch(() => {/* non-blocking */});

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
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined)) {
            return response.forbidden("Você não tem permissão para deletar esta instância");
          }

          // Desconectar se estiver conectada
          if (instance.uazapiToken && (instance.status === 'CONNECTED' || instance.status === 'CONNECTING')) {
            const disconnectResult = await uazapiService.disconnectInstance(instance.uazapiToken);
            if (!disconnectResult.success) {
              logger.warn('Failed to disconnect before delete', { instanceId: id, error: disconnectResult.error });
            }
          }

          // Deletar do UAZapi
          if (instance.uazapiToken) {
            const deleteResult = await uazapiService.deleteInstance(instance.uazapiToken);
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
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined)) {
            return response.forbidden("Você não tem permissão para acessar esta instância");
          }

          // Verificar se está conectada
          if (instance.status !== 'CONNECTED' || !instance.uazapiToken) {
            return response.badRequest("Instância não está conectada");
          }

          // Buscar foto de perfil do UAZapi
          const profileResult = await uazapiService.getProfilePicture(instance.uazapiToken);

          if (!profileResult.success || !profileResult.data) {
            logger.warn('Failed to get profile picture', { instanceId: id, error: profileResult.error });
            return response.badRequest("Falha ao obter foto de perfil");
          }

          // Atualizar no banco de dados
          if (profileResult.data.profilePictureUrl) {
            await repository.update(id, {
              profilePictureUrl: profileResult.data.profilePictureUrl
            } as any);
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
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
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
          if (!instance.uazapiToken) {
            return response.badRequest("Instância não possui token UAZapi");
          }

          // Configurar webhook no UAZapi
          const webhookResult = await uazapiService.setWebhook(
            instance.uazapiToken,
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
          } as any);

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
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
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
          if (!instance.uazapiToken) {
            return response.badRequest("Instância não possui token UAZapi");
          }

          // Buscar configuração do webhook do UAZapi
          const webhookResult = await uazapiService.getWebhook(instance.uazapiToken);

          if (!webhookResult.success || !webhookResult.data) {
            logger.warn('Failed to get webhook config', { instanceId: id, error: webhookResult.error });
            return response.badRequest("Falha ao obter configuração do webhook");
          }

          return response.success({
            webhookUrl: webhookResult.data.webhookUrl || instance.n8nWebhookUrl,
            events: webhookResult.data.events || []
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
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
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
          const userOrgId = context.auth?.session?.user?.currentOrgId ?? undefined;
          if (!checkOrganizationPermission(instance.organizationId, userOrgId)) {
            return response.forbidden("Você não tem permissão para compartilhar esta instância");
          }

              // Gerar token de compartilhamento (expira em 1 hora)
              const shareToken = crypto.randomUUID().replace(/-/g, '');
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
            shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/compartilhar/${shareToken}`
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

          // Se a instância NÃO está conectada, buscar QR code para pareamento
          let qrCode = null;
          if (instance.status !== 'CONNECTED' && instance.uazapiToken) {
            try {
              const qrResult = await uazapiService.generateQR(instance.uazapiToken);
              if (qrResult.success && qrResult.data?.qrcode) {
                qrCode = qrResult.data.qrcode;
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
            organizationName: (instance as any).organization?.name || 'Organização'
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
          let instance = await repository.findByShareToken(token);

          if (!instance) {
            return response.notFound("Token de compartilhamento inválido ou expirado");
          }

          // Verificar se o token não expirou
          if (instance.shareTokenExpiresAt && instance.shareTokenExpiresAt < new Date()) {
            return response.notFound("Token de compartilhamento expirado");
          }

          // Se a instância não tem uazapiToken, provisionar via uazapi primeiro
          // (caso criada pelo Builder ou outro fluxo que não provisionou)
          if (!instance.uazapiToken) {
            logger.info('Instance has no uazapiToken, provisioning via uazapi', { instanceId: instance.id });
            try {
              const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
              const webhookUrl = `${baseUrl}/api/v1/instances/webhook/${instance.id}`;
              const uazapiResult = await uazapiService.createInstance(instance.name, webhookUrl);

              if (uazapiResult.success && uazapiResult.data?.token) {
                instance = await repository.update(instance.id, {
                  uazapiToken: uazapiResult.data.token,
                  brokerId: uazapiResult.data.instance?.id,
                } as any);
                logger.info('Instance provisioned via uazapi', { instanceId: instance.id });
              } else {
                logger.error('Failed to provision instance via uazapi', { error: uazapiResult.error, instanceId: instance.id });
              }
            } catch (error) {
              logger.error('Error provisioning instance via uazapi', { error, instanceId: instance.id });
            }
          }

          // Se a instância não está conectada, tentar reconectar
          if (instance.status !== 'CONNECTED' && instance.uazapiToken) {
            try {
              const connectResult = await uazapiService.connectInstance(instance.uazapiToken);
              if (connectResult.success) {
                await repository.updateStatus(instance.id, 'CONNECTING');
              }
            } catch (error) {
              logger.warn('Failed to reconnect shared instance', { error, instanceId: instance.id });
            }
          }

          // Buscar novo QR code
          let qrCode = null;
          if (instance.uazapiToken) {
            try {
              const qrResult = await uazapiService.generateQR(instance.uazapiToken);
              if (qrResult.success && qrResult.data?.qrcode) {
                qrCode = qrResult.data.qrcode;
              }
            } catch (error) {
              logger.warn('Failed to get refreshed QR code', { error, instanceId: instance.id });
            }
          }

              // Cap: nunca estender além de 4h a partir da criação original (aproximada)
              const currentExpiry = instance.shareTokenExpiresAt ?? new Date();
              const approximateCreation = new Date(currentExpiry.getTime() - 60 * 60 * 1000);
              const absoluteMax = new Date(approximateCreation.getTime() + 4 * 60 * 60 * 1000);
              const candidate = new Date(Date.now() + 60 * 60 * 1000);
              const newExpiresAt = candidate < absoluteMax ? candidate : absoluteMax;
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

    // ==================== GENERATE PAIRING CODE ====================
    generatePairingCode: igniter.mutation({
      name: "GenerateInstancePairingCode",
      description: "Gerar código de pareamento via número de telefone para instância compartilhada",
      path: "/share/:token/pairing-code",
      method: "POST",
      use: [instancesProcedure()],
      body: z.object({
        phone: z.string().min(8, "Número de telefone inválido"),
      }),
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { token } = request.params as { token: string };
        const { phone } = request.body;

        logger.info('Generating pairing code', { shareToken: token });

        try {
          const instance = await repository.findByShareToken(token);

          if (!instance) {
            return response.notFound("Token de compartilhamento inválido ou expirado");
          }

          if (instance.shareTokenExpiresAt && instance.shareTokenExpiresAt < new Date()) {
            return response.notFound("Token de compartilhamento expirado");
          }

          if (!instance.uazapiToken) {
            return response.badRequest("Instância não possui token da UAZapi");
          }

          // Gerar pairing code via UAZapi passando o número de telefone
          const result = await uazapiService.connectInstance(instance.uazapiToken, phone);

          if (!result.success || !result.data) {
            logger.error('Failed to generate pairing code', { error: result.error, shareToken: token });
            return response.badRequest("Falha ao gerar código de pareamento");
          }

          if (!result.data.pairingCode) {
            return response.badRequest("UAZapi não retornou código de pareamento. Verifique se o número está correto.");
          }

          logger.info('Pairing code generated', { shareToken: token });

          return response.success({ pairingCode: result.data.pairingCode });
        } catch (error) {
          logger.error('Failed to generate pairing code', { error, shareToken: token });
          throw error;
        }
      },
    }),

    // ==================== UPDATE CREDENTIALS ====================
    updateCredentials: igniter.mutation({
      name: "UpdateInstanceCredentials",
      description: "Atualizar credenciais Meta (CloudAPI ou Instagram) de uma instância existente",
      path: "/:id/credentials",
      method: "PATCH",
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
      body: UpdateCredentialsSchema,
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };
        const { brokerType, accessToken, phoneNumberId, wabaId, instagramAccountId, pageId } = request.body;

        logger.info('Updating credentials', { instanceId: id, userId: context.auth?.session?.user?.id, brokerType });

        try {
          const instance = await repository.findById(id);
          if (!instance) return response.notFound("Instância não encontrada");

          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined)) {
            return response.forbidden("Você não tem permissão para atualizar esta instância");
          }

          if (brokerType === BrokerType.CLOUDAPI) {
            if (!accessToken || !phoneNumberId || !wabaId) {
              return response.badRequest("CloudAPI requer accessToken, phoneNumberId e wabaId");
            }
            const validation = await validateCloudApiCredentials(accessToken, phoneNumberId);
            if (!validation.valid) {
              return response.badRequest(`Credenciais CloudAPI inválidas: ${validation.error}`);
            }
            const updated = await repository.update(id, {
              cloudApiAccessToken: accessToken,
              cloudApiPhoneNumberId: phoneNumberId,
              cloudApiWabaId: wabaId,
              status: 'CONNECTED',
            } as any);
            logger.info('CloudAPI credentials updated', { instanceId: id });
            return response.success(updated);
          }

          if (brokerType === BrokerType.INSTAGRAM) {
            if (!accessToken || !instagramAccountId) {
              return response.badRequest("Instagram requer accessToken e instagramAccountId");
            }
            const validation = await validateInstagramCredentials(accessToken, instagramAccountId);
            if (!validation.valid) {
              return response.badRequest(`Credenciais Instagram inválidas: ${validation.error}`);
            }
            const updated = await repository.update(id, {
              cloudApiAccessToken: accessToken,
              cloudApiPhoneNumberId: instagramAccountId,
              cloudApiWabaId: pageId ?? null,
              status: 'CONNECTED',
            } as any);
            logger.info('Instagram credentials updated', { instanceId: id });
            return response.success(updated);
          }

          return response.badRequest("Tipo de broker inválido para atualização de credenciais");
        } catch (error) {
          logger.error('Failed to update credentials', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== GET EVENTS ====================
    getEvents: igniter.query({
      name: "GetInstanceEvents",
      description: "Listar eventos de conexão de uma instância",
      path: "/:id/events",
      use: [authOrApiKeyProcedure({ required: true }), instancesProcedure()],
      query: z.object({
        limit: z.coerce.number().min(1).max(50).default(20),
        eventType: z.string().optional(),
      }),
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };
        const { limit, eventType } = request.query || {};

        logger.info('Getting instance events', { instanceId: id, userId: context.auth?.session?.user?.id });

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // RBAC: Verificar permissão de organização
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined)) {
            return response.forbidden("Você não tem permissão para acessar os eventos desta instância");
          }

          // Fetch connection events
          const events = await context.db.connectionEvent.findMany({
            where: {
              connectionId: id,
              ...(eventType ? { eventType: eventType as any } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit ?? 20,
          });

          logger.info('Instance events retrieved', { instanceId: id, count: events.length });

          return response.success(events);
        } catch (error) {
          logger.error('Failed to get instance events', { error, instanceId: id });
          throw error;
        }
      },
    }),
  },
});
