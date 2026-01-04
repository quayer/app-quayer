import { igniter } from "@/igniter";
import { z } from "zod";
import { instancesProcedure } from "../procedures/instances.procedure";
import { authProcedure } from "@/features/auth/procedures/auth.procedure";
import {
  CreateInstanceSchema,
  UpdateInstanceSchema,
  ListInstancesQueryDTO,
  ErrorCode,
} from "../instances.interfaces";
import { ConnectionStatus } from "@prisma/client";
import { uazapiService } from "@/lib/api/uazapi.service";
import { providerOrchestrator } from "@/lib/providers/orchestrator/provider.orchestrator";
import { InstancesRepository } from "../repositories/instances.repository";
import { logger } from "@/services/logger";
import { validatePhoneNumber, formatWhatsAppNumber } from "@/lib/validators/phone.validator";
import { auditLog } from "@/lib/audit";

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
 * @param instanceOrganizationId - ID da organização da instância (pode ser null)
 * @param userOrganizationId - ID da organização do usuário (opcional)
 * @param userRole - Role do usuário (para verificar se é admin)
 *
 * REGRA CRÍTICA: Instâncias SEM organizationId (orphaned) só podem ser acessadas por admin
 */
function checkOrganizationPermission(
  instanceOrganizationId: string | null,
  userOrganizationId?: string,
  userRole?: string
): boolean {
  // Admin tem acesso a todas as instâncias (incluindo orphaned)
  if (userRole === 'admin') return true;

  // Usuário normal precisa ter organizationId
  if (!userOrganizationId) return false;

  // CRÍTICO: Instâncias sem organizationId NÃO podem ser acessadas por usuários normais
  // Isso previne data leakage de instâncias órfãs
  if (!instanceOrganizationId) return false;

  // Verificar se a instância pertence à organização do usuário
  return instanceOrganizationId === userOrganizationId;
}

export const instancesController = igniter.controller({
  name: "instances",
  path: "/instances",
  description: "Gerenciamento de instâncias WhatsApp com integração UAZapi",
  actions: {
    // ==================== VALIDATE CLOUD API CREDENTIALS ====================
    validateCloudApi: igniter.mutation({
      name: "ValidateCloudApiCredentials",
      description: "Validar credenciais do WhatsApp Cloud API sem criar instância",
      path: "/validate-cloud-api",
      method: "POST",
      use: [authProcedure({ required: true }), instancesProcedure()],
      body: z.object({
        cloudApiAccessToken: z.string().min(1, "Token é obrigatório"),
        cloudApiPhoneNumberId: z.string().min(1, "Phone Number ID é obrigatório"),
        cloudApiWabaId: z.string().min(1, "WABA ID é obrigatório"),
      }),
      handler: async ({ request, response }) => {
        const { cloudApiAccessToken, cloudApiPhoneNumberId, cloudApiWabaId } = request.body;

        logger.info('Validating Cloud API credentials', { phoneNumberId: cloudApiPhoneNumberId });

        try {
          const { CloudAPIClient } = await import('@/lib/providers/adapters/cloudapi/cloudapi.client');

          const cloudClient = new CloudAPIClient({
            accessToken: cloudApiAccessToken,
            phoneNumberId: cloudApiPhoneNumberId,
            wabaId: cloudApiWabaId,
          });

          const phoneInfo = await cloudClient.getPhoneInfo();

          logger.info('Cloud API credentials validated successfully', {
            phoneNumberId: cloudApiPhoneNumberId,
            verifiedName: phoneInfo.verified_name,
            displayPhone: phoneInfo.display_phone_number,
          });

          return response.success({
            valid: true,
            phoneNumber: phoneInfo.display_phone_number,
            verifiedName: phoneInfo.verified_name,
            qualityRating: phoneInfo.quality_rating,
            message: 'Credenciais válidas! Conexão com a Meta verificada.',
          });
        } catch (error: any) {
          logger.warn('Cloud API credentials validation failed', {
            error: error.message,
            phoneNumberId: cloudApiPhoneNumberId,
          });

          return response.success({
            valid: false,
            error: error.message || 'Falha ao validar credenciais',
            message: 'Credenciais inválidas ou sem permissão. Verifique o token e IDs.',
          });
        }
      },
    }),

    // ==================== CREATE ====================
    create: igniter.mutation({
      name: "CreateInstance",
      description: "Criar nova instância WhatsApp (UAZapi ou Cloud API)",
      path: "/",
      method: "POST",
      use: [authProcedure({ required: true }), instancesProcedure()],
      body: CreateInstanceSchema,
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { name, phoneNumber, provider, cloudApiAccessToken, cloudApiPhoneNumberId, cloudApiWabaId } = request.body;
        // webhookUrl será configurado no UAZapi via setWebhook endpoint separadamente

        logger.info('Creating instance', {
          userId: context.auth?.session?.user?.id,
          organizationId: context.auth?.session?.user?.currentOrgId,
          instanceName: name,
          provider: provider || 'WHATSAPP_WEB',
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

          // CRÍTICO: Verificar organizationId obrigatório para usuários não-admin
          const organizationId = context.auth?.session?.user?.currentOrgId;
          const userRole = context.auth?.session?.user?.role;

          // Usuários normais DEVEM ter uma organização para criar instâncias
          if (userRole !== 'admin' && !organizationId) {
            logger.warn('User tried to create instance without organization', {
              userId: context.auth?.session?.user?.id,
            });
            return response.badRequest(
              'Você precisa estar associado a uma organização para criar instâncias'
            );
          }

          // Business Rule: Verificar limite de instâncias da organização
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
          if (existingInstance && existingInstance.organizationId === context.auth?.session?.user?.currentOrgId) {
            logger.warn('Instance name already exists', { name, organizationId: context.auth?.session?.user?.currentOrgId });
            return response.badRequest("Já existe uma instância com este nome na sua organização");
          }

          // ==================== CLOUD API FLOW ====================
          if (provider === 'WHATSAPP_CLOUD_API') {
            // Validar campos obrigatórios do Cloud API
            if (!cloudApiAccessToken) {
              return response.badRequest("Token de acesso do Cloud API é obrigatório");
            }
            if (!cloudApiPhoneNumberId) {
              return response.badRequest("ID do telefone (Phone Number ID) é obrigatório");
            }
            if (!cloudApiWabaId) {
              return response.badRequest("ID da WABA (WhatsApp Business Account) é obrigatório");
            }

            // Importar CloudAPIClient dinamicamente para validação
            const { CloudAPIClient } = await import('@/lib/providers/adapters/cloudapi/cloudapi.client');

            // Testar conexão antes de salvar
            const cloudClient = new CloudAPIClient({
              accessToken: cloudApiAccessToken,
              phoneNumberId: cloudApiPhoneNumberId,
              wabaId: cloudApiWabaId,
            });

            try {
              const phoneInfo = await cloudClient.getPhoneInfo();

              logger.info('Cloud API credentials validated', {
                phoneNumberId: cloudApiPhoneNumberId,
                verifiedName: phoneInfo.verified_name,
                displayPhone: phoneInfo.display_phone_number,
              });

              // Criar instância no banco de dados - já conectada!
              const instance = await repository.create({
                name,
                phoneNumber: phoneInfo.display_phone_number || validatedPhoneNumber,
                provider: 'WHATSAPP_CLOUD_API',
                channel: 'WHATSAPP',
                status: 'CONNECTED', // Cloud API já está conectado!
                cloudApiAccessToken,
                cloudApiPhoneNumberId,
                cloudApiWabaId,
                cloudApiVerifiedName: phoneInfo.verified_name,
                organizationId: context.auth?.session?.user?.currentOrgId || undefined,
              });

              logger.info('Cloud API instance created successfully', {
                instanceId: instance.id,
                userId: context.auth?.session?.user?.id,
                verifiedName: phoneInfo.verified_name,
              });

              // ✅ AUDIT LOG: Registrar criação de instância Cloud API
              await auditLog.logCrud('create', 'instance', instance.id, context.auth?.session?.user?.id || 'system', context.auth?.session?.user?.currentOrgId, {
                provider: 'WHATSAPP_CLOUD_API',
                instanceName: name,
              });

              return response.created({
                ...instance,
                cloudApiAccessToken: undefined, // Não expor o token na resposta
              });
            } catch (cloudError: any) {
              logger.error('Cloud API validation failed', {
                error: cloudError.message,
                phoneNumberId: cloudApiPhoneNumberId,
              });
              return response.badRequest(`Falha ao validar credenciais do Cloud API: ${cloudError.message}`);
            }
          }

          // ==================== UAZAPI FLOW (DEFAULT) ====================
          // Business Logic: Criar instância na UAZapi primeiro
          const uazapiResult = await uazapiService.createInstance(name);

          if (!uazapiResult.success || !uazapiResult.data) {
            const errorDetails = uazapiResult.error || uazapiResult.message || 'Erro desconhecido na UAZapi'
            logger.error('UAZapi instance creation failed', {
              error: errorDetails,
              name,
              fullResponse: uazapiResult
            });
            return response.badRequest(`Falha ao criar instância na UAZapi: ${errorDetails}`);
          }

          // Business Logic: Criar instância no banco de dados
          // ✅ CORREÇÃO: Usar campos corretos do Prisma schema (provider, uazapiToken, uazapiInstanceId)
          const instance = await repository.create({
            name,
            phoneNumber: validatedPhoneNumber,
            provider: 'WHATSAPP_WEB', // UAZAPI usa WhatsApp Web
            channel: 'WHATSAPP',
            uazapiToken: uazapiResult.data.token,
            uazapiInstanceId: uazapiResult.data.instance?.id,
            organizationId: context.auth?.session?.user?.currentOrgId || undefined,
          });

          logger.info('Instance created successfully', {
            instanceId: instance.id,
            userId: context.auth?.session?.user?.id
          });

          // ✅ AUDIT LOG: Registrar criação de instância UAZAPI
          await auditLog.logCrud('create', 'instance', instance.id, context.auth?.session?.user?.id || 'system', context.auth?.session?.user?.currentOrgId, {
            provider: 'WHATSAPP_WEB',
            instanceName: name,
          });

          return response.created(instance);
        } catch (error) {
          logger.error('Failed to create instance', { error, userId: context.auth?.session?.user?.id });
          throw error;
        }
      },
    }),

    // ==================== LIST WITH PAGINATION ====================
    // ✅ Caching: 60 segundos por query unique
    list: igniter.query({
      name: "ListInstances",
      description: "Listar instâncias WhatsApp com paginação e filtros",
      path: "/",
      use: [authProcedure({ required: true }), instancesProcedure()],
      query: ListInstancesQueryDTO,
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { page = 1, limit = 20, status = 'all', search } = request.query || {};

        // Extrair informações do usuário
        const user = context.auth?.session?.user;
        const isAdmin = user?.role === 'admin';

        // 🔒 SECURITY FIX: Bloquear usuários sem organização (previne vazamento de dados)
        if (!isAdmin && !user?.currentOrgId) {
          return response.forbidden('Usuário não possui organização associada. Complete o onboarding primeiro.');
        }

        // Business Rule: Admin e usuário normal veem instâncias da organização selecionada
        // Admin pode ver todas se currentOrgId for null (seleção "Todas")
        // CORREÇÃO: Admin respeita o seletor de organização quando currentOrgId está definido
        const organizationId = user?.currentOrgId || undefined;

        // 🚀 Cache: Verificar cache antes de buscar no banco
        const cacheKey = `instances:list:${organizationId || 'all'}:${status}:${search || ''}:${page}:${limit}`;

        try {
          const cached = await igniter.store.get<any>(cacheKey);
          if (cached) {
            logger.debug('Cache hit for instances list', { cacheKey });
            return response.success({ ...cached, source: 'cache' });
          }
        } catch (e) {
          // Cache miss ou erro - continuar sem cache
        }

        try {
          const result = await repository.findAllPaginated({
            organizationId: organizationId ?? undefined,
            page,
            limit,
            status: status === 'all' ? undefined : status,
            search,
          });

          // 🔄 ASYNC: Verificar status real de instâncias em background
          // ✅ CORREÇÃO BRUTAL: Incluir DISCONNECTED para sincronizar instâncias importadas
          // Isso não bloqueia a resposta, melhora a UX com status mais atualizado no próximo polling
          const instancesToSync = result.instances.filter(
            (inst: any) => (
              inst.uazapiToken && (
                inst.status === 'CONNECTING' ||
                inst.status === 'DISCONNECTED' ||
                (inst.status === 'CONNECTED' && !inst.phoneNumber)
              )
            )
          );

          if (instancesToSync.length > 0) {
            // Executar em background com Promise.all para paralelismo
            setImmediate(async () => {
              await Promise.all(instancesToSync.map(async (instance) => {
                if (!instance.uazapiToken) return; // Type guard
                try {
                  const statusResult = await uazapiService.getInstanceStatus(instance.uazapiToken);
                  if (statusResult.success && statusResult.data) {
                    const realStatus = statusResult.data.status?.toLowerCase();
                    logger.info('Async status check', {
                      instanceId: instance.id,
                      dbStatus: instance.status,
                      realStatus,
                      phoneNumber: statusResult.data.phoneNumber
                    });

                    if (realStatus === 'connected' || realStatus === 'open') {
                      // ✅ Atualizar status no banco se diferente
                      if (instance.status !== 'CONNECTED') {
                        await repository.updateStatus(
                          instance.id,
                          'CONNECTED',
                          statusResult.data?.phoneNumber || undefined,
                          (statusResult.data as any)?.profilePicture || null
                        );
                        logger.info('Async status sync: instance updated to CONNECTED', {
                          instanceId: instance.id,
                          name: instance.name,
                          previousStatus: instance.status
                        });
                      }
                    } else if (realStatus === 'disconnected' || realStatus === 'close') {
                      // ✅ Também sincronizar quando desconectar
                      if (instance.status !== 'DISCONNECTED') {
                        await repository.updateStatus(instance.id, 'DISCONNECTED');
                        logger.info('Async status sync: instance updated to DISCONNECTED', {
                          instanceId: instance.id,
                          name: instance.name,
                          previousStatus: instance.status
                        });
                      }
                    }
                  }
                } catch (err) {
                  // Erros de background são silenciosos
                }
              }));
            });
          }

          const responseData = {
            data: result.instances,
            pagination: {
              page,
              limit,
              total: result.total,
              totalPages: Math.ceil(result.total / limit),
            },
          };

          // 🚀 Cache: Salvar resultado com TTL de 30 segundos (reduzido para sync mais frequente)
          try {
            await igniter.store.set(cacheKey, responseData, { ttl: 30 });
          } catch (e) {
            // Erro ao salvar cache - não crítico
          }

          return response.success(responseData);
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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined, context.auth?.session?.user?.role)) {
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
          if (!checkOrganizationPermission(existingInstance.organizationId, context.auth?.session?.user?.currentOrgId || undefined, context.auth?.session?.user?.role)) {
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
      description: "Conectar instância e gerar QR Code (ou validar credenciais Cloud API)",
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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined, context.auth?.session?.user?.role)) {
            return response.forbidden("Você não tem permissão para conectar esta instância");
          }

          // Verificar se está REALMENTE conectada
          // WhatsApp Web: precisa ter status CONNECTED E phoneNumber
          // Cloud API: precisa ter status CONNECTED (usa token, não phoneNumber)
          const isReallyConnected = instance.status === 'CONNECTED' &&
            (instance.provider === 'WHATSAPP_CLOUD_API' || !!instance.phoneNumber);

          if (isReallyConnected) {
            return response.badRequest("Instância já está conectada");
          }

          // ==================== CLOUD API CONNECT ====================
          if (instance.provider === 'WHATSAPP_CLOUD_API') {
            if (!instance.cloudApiAccessToken || !instance.cloudApiPhoneNumberId) {
              return response.badRequest("Instância Cloud API não possui credenciais configuradas");
            }

            try {
              const { CloudAPIClient } = await import('@/lib/providers/adapters/cloudapi/cloudapi.client');
              const cloudClient = new CloudAPIClient({
                accessToken: instance.cloudApiAccessToken,
                phoneNumberId: instance.cloudApiPhoneNumberId,
                wabaId: instance.cloudApiWabaId || '',
              });

              const phoneInfo = await cloudClient.getPhoneInfo();

              // Atualizar status para CONNECTED
              await repository.updateStatus(id, 'CONNECTED', phoneInfo.display_phone_number, null);

              logger.info('Cloud API instance connected', {
                instanceId: id,
                userId: context.auth?.session?.user?.id,
                verifiedName: phoneInfo.verified_name,
              });

              return response.success({
                message: "Instância Cloud API conectada com sucesso",
                status: 'connected',
                phoneNumber: phoneInfo.display_phone_number,
                verifiedName: phoneInfo.verified_name,
                provider: 'cloudapi',
                // Cloud API não usa QR Code
                qrcode: null,
                pairingCode: null,
              });
            } catch (cloudError: any) {
              logger.error('Cloud API connection failed', {
                error: cloudError.message,
                instanceId: id,
              });
              return response.badRequest(`Falha ao conectar Cloud API: ${cloudError.message}`);
            }
          }

          // ==================== UAZAPI CONNECT ====================
          if (!instance.uazapiToken) {
            return response.badRequest("Instância não possui token da UAZapi");
          }

          // Usar orchestrator para retry automático e fallback
          const connectionResult = await providerOrchestrator.connectInstance(id);

          if (!connectionResult.success || !connectionResult.data) {
            logger.error('Provider connection failed', {
              error: connectionResult.error,
              instanceId: id,
              provider: connectionResult.provider
            });
            return response.badRequest("Falha ao conectar instância");
          }

          const qrCode = connectionResult.data.qrCode;
          if (!qrCode) {
            return response.badRequest("Provider não retornou QR Code válido");
          }

          await repository.updateQRCode(
            id,
            qrCode,
            undefined // pairingCode será tratado posteriormente se necessário
          );

          logger.info('Instance connected via orchestrator', {
            instanceId: id,
            userId: context.auth?.session?.user?.id,
            provider: connectionResult.provider
          });

          return response.success({
            qrcode: qrCode,
            expires: 120000,
            pairingCode: undefined,
          });
        } catch (error) {
          logger.error('Failed to connect instance', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== PAIRING CODE WITH RBAC ====================
    pairingCode: igniter.mutation({
      name: "GetPairingCode",
      description: "Gerar código de pareamento para conexão sem QR Code",
      path: "/:id/pairing-code",
      method: "POST",
      use: [authProcedure({ required: true }), instancesProcedure()],
      body: z.object({ phoneNumber: z.string().min(10, "Número inválido") }),
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };
        const { phoneNumber } = request.body;

        logger.info('Generating pairing code', { instanceId: id, phone: phoneNumber, userId: context.auth?.session?.user?.id });

        try {
          const instance = await repository.findById(id);

          if (!instance) {
            return response.notFound("Instância não encontrada");
          }

          // RBAC: Verificar permissão de organização
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined, context.auth?.session?.user?.role)) {
            return response.forbidden("Você não tem permissão para acessar esta instância");
          }

          if (instance.provider === 'WHATSAPP_CLOUD_API') {
            return response.badRequest("Cloud API não suporta código de pareamento desta forma.");
          }

          if (!instance.uazapiToken) {
            return response.badRequest("Instância não possui token da UAZapi");
          }

          // Usar serviço diretamente pois orchestrator pode não expor pairing code com phone ainda
          const result = await uazapiService.connectInstance(instance.uazapiToken, phoneNumber);

          if (!result.success || !result.data) {
            return response.badRequest(result.message || "Erro ao gerar código na UAZapi");
          }

          return response.success({
            code: result.data.pairingCode,
            expires: result.data.expires
          });
        } catch (error) {
          logger.error('Failed to generate pairing code', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== GET STATUS WITH RBAC ====================
    getStatus: igniter.query({
      name: "GetInstanceStatus",
      description: "Verificar status da instância (UAZapi ou Cloud API)",
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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined, context.auth?.session?.user?.role)) {
            return response.forbidden("Você não tem permissão para verificar o status desta instância");
          }

          // ==================== CLOUD API STATUS CHECK ====================
          if (instance.provider === 'WHATSAPP_CLOUD_API') {
            if (!instance.cloudApiAccessToken || !instance.cloudApiPhoneNumberId) {
              return response.badRequest("Instância Cloud API não possui credenciais configuradas");
            }

            try {
              const { CloudAPIClient } = await import('@/lib/providers/adapters/cloudapi/cloudapi.client');
              const cloudClient = new CloudAPIClient({
                accessToken: instance.cloudApiAccessToken,
                phoneNumberId: instance.cloudApiPhoneNumberId,
                wabaId: instance.cloudApiWabaId || '',
              });

              const phoneInfo = await cloudClient.getPhoneInfo();

              // Cloud API está sempre conectado se as credenciais são válidas
              const normalizedStatus = 'CONNECTED' as ConnectionStatus;

              // Atualizar no banco se necessário
              if (instance.status !== normalizedStatus) {
                await repository.updateStatus(
                  id,
                  normalizedStatus,
                  phoneInfo.display_phone_number,
                  null
                );
              }

              return response.success({
                status: 'connected',
                phoneNumber: phoneInfo.display_phone_number,
                profileName: phoneInfo.verified_name || instance.cloudApiVerifiedName,
                profilePictureUrl: null, // Cloud API não tem profile picture fácil de obter
                provider: 'cloudapi',
              });
            } catch (cloudError: any) {
              logger.error('Cloud API status check failed', {
                error: cloudError.message,
                instanceId: id,
              });

              // Atualizar status para ERROR se falhou
              await repository.updateStatus(id, 'ERROR' as ConnectionStatus);

              return response.success({
                status: 'error',
                error: cloudError.message,
                provider: 'cloudapi',
              });
            }
          }

          // ==================== UAZAPI STATUS CHECK ====================
          if (!instance.uazapiToken) {
            return response.badRequest("Instância não possui token da UAZapi");
          }

          // Usar orchestrator para caching automático e retry
          const statusResult = await providerOrchestrator.getInstanceStatus(id);

          if (!statusResult.success || !statusResult.data) {
            logger.error('Failed to get instance status via orchestrator', {
              error: statusResult.error,
              instanceId: id,
              provider: statusResult.provider
            });
            return response.badRequest("Falha ao verificar status");
          }

          // Atualizar status no banco se mudou (normalize to uppercase to match Prisma enum)
          const rawStatus = statusResult.data.status?.toString() || 'DISCONNECTED';
          const normalizedStatus = rawStatus.toUpperCase() as ConnectionStatus;
          if (normalizedStatus !== instance.status) {
            await repository.updateStatus(
              id,
              normalizedStatus,
              statusResult.data.phoneNumber,
              statusResult.data.profilePicture || null
            );

            // Invalidar cache da lista de instâncias para que o frontend pegue dados frescos
            const organizationId = instance.organizationId || 'all';
            try {
              // Limpar cache de todas as possíveis combinações de query
              const cachePatterns = [
                `instances:list:${organizationId}:all::1:20`,
                `instances:list:${organizationId}:all::1:10`,
                `instances:list:all:all::1:20`,
                `instances:list:all:all::1:10`,
              ];
              for (const pattern of cachePatterns) {
                await (igniter.store as any).del(pattern);
              }
              logger.info('Invalidated instances list cache after status change', {
                instanceId: id,
                oldStatus: instance.status,
                newStatus: normalizedStatus
              });
            } catch (cacheError) {
              logger.warn('Failed to invalidate cache', { error: cacheError });
            }
          }

          return response.success({
            status: normalizedStatus.toLowerCase(),
            phoneNumber: statusResult.data.phoneNumber,
            profileName: statusResult.data.profileName,
            profilePictureUrl: statusResult.data.profilePicture,
          });
        } catch (error) {
          logger.error('Failed to get instance status', { error, instanceId: id });
          throw error;
        }
      },
    }),

    // ==================== DISCONNECT WITH RBAC ====================
    disconnect: igniter.mutation({
      name: "DisconnectInstance",
      description: "Desconectar instância WhatsApp (UAZapi ou Cloud API)",
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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined, context.auth?.session?.user?.role)) {
            return response.forbidden("Você não tem permissão para desconectar esta instância");
          }

          // ==================== CLOUD API DISCONNECT ====================
          if (instance.provider === 'WHATSAPP_CLOUD_API') {
            // Cloud API não tem conceito de "desconectar" como UAZAPI
            // Apenas atualizamos o status no banco e limpamos credenciais se desejado
            await repository.updateStatus(id, 'DISCONNECTED');

            logger.info('Cloud API instance marked as disconnected', {
              instanceId: id,
              userId: context.auth?.session?.user?.id,
            });

            // ✅ AUDIT LOG: Registrar desconexão Cloud API
            await auditLog.logConnection('disconnect', id, context.auth?.session?.user?.id || 'system', instance.organizationId, {
              provider: 'WHATSAPP_CLOUD_API',
              instanceName: instance.name,
            });

            return response.success({
              message: "Instância Cloud API marcada como desconectada. Para reconectar, valide as credenciais novamente.",
              provider: 'cloudapi',
            });
          }

          // ==================== UAZAPI DISCONNECT ====================
          if (!instance.uazapiToken) {
            return response.badRequest("Instância não possui token da UAZapi");
          }

          // Usar orchestrator para retry automático
          const disconnectResult = await providerOrchestrator.disconnectInstance(id);

          if (!disconnectResult.success) {
            logger.warn('Provider disconnection failed', {
              error: disconnectResult.error,
              instanceId: id,
              provider: disconnectResult.provider
            });
            // Continue mesmo com falha, pois queremos atualizar o status local
          }

          await repository.updateStatus(id, 'DISCONNECTED');
          await repository.clearQRCode(id);

          logger.info('Instance disconnected via orchestrator', {
            instanceId: id,
            userId: context.auth?.session?.user?.id,
            provider: disconnectResult.provider
          });

          // ✅ AUDIT LOG: Registrar desconexão UAZAPI
          await auditLog.logConnection('disconnect', id, context.auth?.session?.user?.id || 'system', instance.organizationId, {
            provider: 'WHATSAPP_WEB',
            instanceName: instance.name,
          });

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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined, context.auth?.session?.user?.role)) {
            return response.forbidden("Você não tem permissão para deletar esta instância");
          }

          // Desconectar se estiver conectada (via orchestrator)
          if (instance.uazapiToken && (instance.status === 'CONNECTED' || instance.status === 'CONNECTING')) {
            const disconnectResult = await providerOrchestrator.disconnectInstance(id);
            if (!disconnectResult.success) {
              logger.warn('Failed to disconnect before delete', {
                instanceId: id,
                error: disconnectResult.error,
                provider: disconnectResult.provider
              });
            }
          }

          // Deletar do provider (via orchestrator)
          if (instance.uazapiToken) {
            const deleteResult = await providerOrchestrator.deleteInstance(id);
            if (!deleteResult.success) {
              logger.warn('Failed to delete from provider', {
                instanceId: id,
                error: deleteResult.error,
                provider: deleteResult.provider
              });
            }
          }

          // Deletar do banco de dados
          await repository.delete(id);

          logger.info('Instance deleted successfully', { instanceId: id, userId: context.auth?.session?.user?.id });

          // ✅ AUDIT LOG: Registrar exclusão de instância
          await auditLog.logCrud('delete', 'instance', id, context.auth?.session?.user?.id || 'system', instance.organizationId, {
            instanceName: instance.name,
            provider: instance.provider,
          });

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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined, context.auth?.session?.user?.role)) {
            return response.forbidden("Você não tem permissão para acessar esta instância");
          }

          // Verificar se está conectada
          if (instance.status !== 'CONNECTED' || !instance.uazapiToken) {
            return response.badRequest("Instância não está conectada");
          }

          // Buscar foto de perfil via orchestrator
          const profileResult = await providerOrchestrator.getProfilePicture(id);

          if (!profileResult.success || !profileResult.data) {
            logger.warn('Failed to get profile picture via orchestrator', {
              instanceId: id,
              error: profileResult.error,
              provider: profileResult.provider
            });
            return response.badRequest("Falha ao obter foto de perfil");
          }

          // Note: profilePictureUrl is fetched on-demand and not stored in database

          return response.success({
            profilePictureUrl: profileResult.data.url
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
      body: z.object({
        webhookUrl: z.string().url(),
        events: z.array(z.string()),
      }),
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { id } = request.params as { id: string };
        const { webhookUrl, events } = request.body;

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

          // Webhook é gerenciado diretamente no UAZapi, não precisa salvar no banco
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
            webhookUrl: webhookResult.data.webhookUrl || null,
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
          const userOrgId = context.auth?.session?.user?.currentOrgId ?? undefined;
          if (!checkOrganizationPermission(instance.organizationId, userOrgId, context.auth?.session?.user?.role)) {
            return response.forbidden("Você não tem permissão para compartilhar esta instância");
          }

          // Gerar token de compartilhamento (expira em 1 hora)
          const shareToken = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

          // Salvar token no banco de dados usando o método específico (isNewToken = true para resetar contador)
          await repository.updateShareToken(id, {
            shareToken,
            shareTokenExpiresAt: expiresAt
          }, true);

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

          // === ATENÇÃO: Verificar status REAL via UAZapi ===
          // Isso é crítico para detectar quando o usuário escaneou o QR Code
          let currentStatus = instance.status;
          let phoneNumber = instance.phoneNumber;
          let profileName = instance.profileName;

          if (instance.uazapiToken && instance.status !== 'CONNECTED') {
            try {
              const statusResult = await uazapiService.getInstanceStatus(instance.uazapiToken);
              if (statusResult.success && statusResult.data) {
                const realStatus = statusResult.data.status?.toLowerCase();

                // Se a UAZapi diz que está conectado, atualizar no banco
                if (realStatus === 'connected' || realStatus === 'open') {
                  currentStatus = 'CONNECTED' as ConnectionStatus;
                  phoneNumber = statusResult.data.phoneNumber || phoneNumber;
                  // UAZapi não retorna profileName, usar name da instância
                  profileName = statusResult.data.name || profileName;

                  // Atualizar status no banco
                  await repository.updateStatus(
                    instance.id,
                    currentStatus,
                    phoneNumber || undefined, // Converter null para undefined
                    (statusResult.data as any)?.profilePicture || null
                  );

                  logger.info('Shared instance detected as connected', {
                    instanceId: instance.id,
                    phoneNumber
                  });
                }
              }
            } catch (statusError) {
              logger.warn('Failed to check UAZapi status for shared instance', {
                error: statusError,
                instanceId: instance.id
              });
            }
          }

          // Se a instância NÃO está conectada, gerar QR code para conexão
          let qrCode = null;
          if (currentStatus !== 'CONNECTED' && instance.uazapiToken) {
            try {
              // Primeiro, iniciar conexão para obter QR code
              const connectResult = await uazapiService.connectInstance(instance.uazapiToken);
              if (connectResult.success && connectResult.data?.qrcode) {
                qrCode = connectResult.data.qrcode;
                // Atualizar status para CONNECTING se ainda não estiver
                if (currentStatus !== 'CONNECTING') {
                  await repository.updateStatus(instance.id, 'CONNECTING');
                  currentStatus = 'CONNECTING' as ConnectionStatus;
                }
              } else {
                // Tentar buscar QR code diretamente
                const qrResult = await uazapiService.generateQR(instance.uazapiToken);
                if (qrResult.success && qrResult.data?.qrcode) {
                  qrCode = qrResult.data.qrcode;
                }
              }
            } catch (error) {
              logger.warn('Failed to get QR code for shared instance', { error, instanceId: instance.id });
            }
          }

          logger.info('Shared instance data retrieved successfully', {
            instanceId: instance.id,
            status: currentStatus
          });

          return response.success({
            id: instance.id,
            name: instance.name,
            status: currentStatus,
            phoneNumber,
            profileName,
            qrCode,
            expiresAt: instance.shareTokenExpiresAt,
            organizationName: (instance as any).organization?.name || 'Organizacao'
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

          // Verificar limite de extensões (máximo 3)
          const MAX_EXTENSIONS = 3;
          const currentExtensions = (instance as any).shareTokenExtensionCount || 0;

          if (currentExtensions >= MAX_EXTENSIONS) {
            logger.warn('Share token reached maximum extension limit', {
              instanceId: instance.id,
              extensions: currentExtensions
            });
            return response.badRequest('Link de compartilhamento atingiu o limite máximo de 3 extensões. Gere um novo link.');
          }

          // Estender expiração do token (mais 1 hora), com limite máximo de 24h desde criação
          // Extrair timestamp de criação do token: share_{timestamp}_{random}
          const tokenParts = instance.shareToken?.split('_');
          const createdAtTimestamp = tokenParts?.[1] ? parseInt(tokenParts[1]) : Date.now();
          const maxAbsoluteExpiry = createdAtTimestamp + (24 * 60 * 60 * 1000); // 24h máximo
          const proposedExpiry = Date.now() + (60 * 60 * 1000); // +1h

          // Usar o menor entre proposto e limite absoluto
          const newExpiresAt = new Date(Math.min(proposedExpiry, maxAbsoluteExpiry));

          // Se já passou do limite absoluto, não estender mais
          if (Date.now() >= maxAbsoluteExpiry) {
            logger.warn('Share token reached maximum expiry limit', { instanceId: instance.id });
            return response.badRequest('Link de compartilhamento atingiu o limite máximo de 24 horas. Gere um novo link.');
          }

          // Atualizar token e incrementar contador de extensões
          await repository.updateShareToken(instance.id, {
            shareToken: instance.shareToken!,
            shareTokenExpiresAt: newExpiresAt
          }); // isNewToken = false (default) incrementa o contador

          logger.info('Shared QR code refreshed successfully', {
            instanceId: instance.id,
            newExpiresAt,
            extensionCount: currentExtensions + 1
          });

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

    // ==================== GET PAIRING CODE FOR SHARED INSTANCE ====================
    getSharedPairingCode: igniter.mutation({
      name: "GetSharedPairingCode",
      description: "Gerar código de pareamento para instância compartilhada",
      path: "/share/:token/pairing-code",
      method: "POST",
      use: [instancesProcedure()],
      body: z.object({
        phone: z.string().min(10, "Número de telefone inválido").max(15, "Número de telefone inválido"),
      }),
      handler: async ({ request, response, context }) => {
        const repository = new InstancesRepository(context.db);
        const { token } = request.params as { token: string };
        const { phone } = request.body;

        logger.info('Generating pairing code for shared instance', { shareToken: token, phone });

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

          // Verificar se a instância tem token do UAZapi
          if (!instance.uazapiToken) {
            return response.badRequest("Instância não possui token de conexão");
          }

          // Verificar se a instância já está REALMENTE conectada (Status Local + phoneNumber)
          // WhatsApp Web só está conectado se tiver phoneNumber confirmado
          const isLocallyConnected = instance.status === 'CONNECTED' && !!instance.phoneNumber;
          if (isLocallyConnected) {
            logger.info('Instance already connected (Local DB)', { instanceId: instance.id, phoneNumber: instance.phoneNumber });
            return response.success({
              status: 'connected',
              message: 'Instância já está conectada!',
              phoneNumber: instance.phoneNumber,
              alreadyConnected: true
            });
          }

          // Verificar status REAL via UAZapi (caso o banco esteja desatualizado)
          try {
            const statusResult = await uazapiService.getInstanceStatus(instance.uazapiToken);
            const realStatus = statusResult.data?.status?.toLowerCase();

            if (statusResult.success && (realStatus === 'connected' || realStatus === 'open')) {
              const phoneNumber = statusResult.data?.phoneNumber || instance.phoneNumber;

              // Atualizar status no banco
              await repository.updateStatus(
                instance.id,
                'CONNECTED',
                phoneNumber || undefined,
                (statusResult.data as any)?.profilePicture || null
              );

              logger.info('Instance already connected (Real Status), returning success', { instanceId: instance.id });
              return response.success({
                status: 'connected',
                message: 'Instância já está conectada!',
                phoneNumber: phoneNumber,
                alreadyConnected: true
              });
            }
          } catch (statusError) {
            // Ignorar erro de verificação de status e tentar gerar código
            logger.warn('Failed to check real status before pairing', { instanceId: instance.id, error: statusError });
          }

          // Gerar pairing code via UAZapi
          const connectResult = await uazapiService.connectInstance(instance.uazapiToken, phone);

          logger.info('UAZapi connect result for pairing code', {
            success: connectResult.success,
            hasPairingCode: !!connectResult.data?.pairingCode,
            pairingCode: connectResult.data?.pairingCode,
            error: connectResult.error,
            instanceId: instance.id,
            phone
          });

          if (!connectResult.success) {
            logger.warn('Failed to connect instance for pairing', { error: connectResult.error, instanceId: instance.id });
            return response.badRequest(connectResult.error || "Falha ao conectar instância. Tente novamente.");
          }

          const pairingCode = connectResult.data?.pairingCode;
          if (!pairingCode) {
            logger.warn('No pairing code returned from UAZapi', { data: connectResult.data, instanceId: instance.id });
            return response.badRequest("Código de pareamento não disponível. A instância pode já estar conectada ou use o QR Code.");
          }

          // Atualizar status para CONNECTING
          await repository.updateStatus(instance.id, 'CONNECTING');

          // Verificar limite de extensões (máximo 3)
          const MAX_EXTENSIONS = 3;
          const currentExtensions = (instance as any).shareTokenExtensionCount || 0;

          if (currentExtensions >= MAX_EXTENSIONS) {
            logger.warn('Share token reached maximum extension limit for pairing', {
              instanceId: instance.id,
              extensions: currentExtensions
            });
            return response.badRequest('Link de compartilhamento atingiu o limite máximo de 3 extensões. Gere um novo link.');
          }

          // Estender expiração do token (mais 1 hora), com limite máximo de 24h desde criação
          // Extrair timestamp de criação do token: share_{timestamp}_{random}
          const tokenParts = instance.shareToken?.split('_');
          const createdAtTimestamp = tokenParts?.[1] ? parseInt(tokenParts[1]) : Date.now();
          const maxAbsoluteExpiry = createdAtTimestamp + (24 * 60 * 60 * 1000); // 24h máximo
          const proposedExpiry = Date.now() + (60 * 60 * 1000); // +1h

          // Usar o menor entre proposto e limite absoluto
          const newExpiresAt = new Date(Math.min(proposedExpiry, maxAbsoluteExpiry));

          // Se já passou do limite absoluto, não estender mais
          if (Date.now() >= maxAbsoluteExpiry) {
            logger.warn('Share token reached maximum expiry limit for pairing', { instanceId: instance.id });
            return response.badRequest('Link de compartilhamento atingiu o limite máximo de 24 horas. Gere um novo link.');
          }

          // Atualizar token e incrementar contador de extensões
          await repository.updateShareToken(instance.id, {
            shareToken: instance.shareToken!,
            shareTokenExpiresAt: newExpiresAt
          }); // isNewToken = false (default) incrementa o contador

          logger.info('Pairing code generated successfully', {
            instanceId: instance.id,
            pairingCode,
            extensionCount: currentExtensions + 1
          });

          return response.success({
            pairingCode,
            expiresAt: newExpiresAt
          });
        } catch (error) {
          logger.error('Failed to generate pairing code', { error, shareToken: token });
          throw error;
        }
      },
    }),

    // ==================== DELETE FROM UAZAPI BY TOKEN (ADMIN ONLY) ====================
    deleteByToken: igniter.mutation({
      name: "DeleteInstanceByToken",
      description: "Deletar instância do UAZapi usando o token (Admin apenas)",
      path: "/delete-by-token",
      method: "POST",
      use: [authProcedure({ required: true }), instancesProcedure()],
      body: z.object({
        token: z.string().min(1, "Token é obrigatório"),
      }),
      handler: async ({ request, response, context }) => {
        const { token } = request.body;

        logger.info('Deleting instance from UAZapi by token', { userId: context.auth?.session?.user?.id });

        // RBAC: Only admin can delete instances by token
        const userRole = context.auth?.session?.user?.role;
        if (userRole !== 'admin') {
          return response.forbidden("Apenas administradores podem excluir instâncias diretamente do UAZapi");
        }

        try {
          // Tentar desconectar primeiro
          try {
            await uazapiService.disconnectInstance(token);
          } catch (disconnectError) {
            logger.warn('Failed to disconnect instance before delete', { error: disconnectError });
            // Continue mesmo com erro - pode já estar desconectada
          }

          // Deletar do UAZapi
          const deleteResult = await uazapiService.deleteInstance(token);

          if (!deleteResult.success) {
            logger.error('Failed to delete instance from UAZapi', { error: deleteResult.error });
            return response.badRequest(`Falha ao excluir do UAZapi: ${deleteResult.error || 'Erro desconhecido'}`);
          }

          logger.info('Instance deleted from UAZapi successfully');

          return response.success({
            message: "Instância excluída do UAZapi com sucesso",
          });
        } catch (error: any) {
          logger.error('Failed to delete instance by token', { error });
          return response.badRequest(error.message || 'Erro ao excluir instância');
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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined, context.auth?.session?.user?.role)) {
            return response.forbidden("Você não tem permissão para atualizar esta instância");
          }

          // Verificar se está conectada
          if (instance.status !== 'CONNECTED' || !instance.uazapiToken) {
            return response.badRequest("Instância não está conectada");
          }

          // Validar nome
          if (!name || name.trim().length === 0) {
            return response.badRequest("Nome é obrigatório");
          }

          if (name.length > 50) {
            return response.badRequest("Nome deve ter no máximo 50 caracteres");
          }

          // Atualizar no banco de dados (UAZapi updateProfileName não implementado)
          await repository.update(id, {
            name: name.trim()  // profileName is not in update type
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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined, context.auth?.session?.user?.role)) {
            return response.forbidden("Você não tem permissão para atualizar esta instância");
          }

          // Verificar se está conectada
          if (instance.status !== 'CONNECTED' || !instance.uazapiToken) {
            return response.badRequest("Instância não está conectada");
          }

          // TODO: UAZapi updateProfileImage não implementado
          return response.badRequest("Funcionalidade não implementada: atualização de foto de perfil via UAZapi");
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
          if (!checkOrganizationPermission(instance.organizationId, context.auth?.session?.user?.currentOrgId || undefined, context.auth?.session?.user?.role)) {
            return response.forbidden("Você não tem permissão para reiniciar esta instância");
          }

          if (!instance.uazapiToken) {
            return response.badRequest("Instância não possui token da UAZapi");
          }

          // Desconectar primeiro (via orchestrator)
          logger.info('Disconnecting instance for restart', { instanceId: id });

          const disconnectResult = await providerOrchestrator.disconnectInstance(id);

          if (!disconnectResult.success) {
            logger.warn('Failed to disconnect during restart', {
              instanceId: id,
              error: disconnectResult.error,
              provider: disconnectResult.provider
            });
          }

          // Atualizar status
          await repository.updateStatus(id, 'DISCONNECTED');
          await repository.clearQRCode(id);

          // Aguardar 2 segundos para garantir desconexão
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Reconectar (via orchestrator)
          logger.info('Reconnecting instance after restart', { instanceId: id });

          const connectionResult = await providerOrchestrator.connectInstance(id);

          if (!connectionResult.success || !connectionResult.data) {
            logger.error('Failed to reconnect during restart', {
              instanceId: id,
              error: connectionResult.error,
              provider: connectionResult.provider
            });
            return response.badRequest("Falha ao reconectar instância após reinício");
          }

          // Atualizar com novo QR code
          const qrCode = connectionResult.data.qrCode;
          if (qrCode) {
            await repository.updateQRCode(
              id,
              qrCode,
              undefined
            );
          }

          logger.info('Instance restarted via orchestrator', {
            instanceId: id,
            provider: connectionResult.provider
          });

          return response.success({
            message: "Instância reiniciada com sucesso",
            qrcode: qrCode,
            expires: 120000,
            pairingCode: undefined,
          });
        } catch (error) {
          logger.error('Failed to restart instance', { error, instanceId: id });
          throw error;
        }
      },
    }),

    /**
     * GET /instances/:id/events
     * Retorna histórico de eventos de conexão/desconexão
     */
    getEvents: igniter.query({
      name: "GetInstanceEvents",
      description: "Histórico de eventos de conexão/desconexão",
      path: "/:id/events",
      query: z.object({
        limit: z.coerce.number().min(1).max(100).default(50),
        offset: z.coerce.number().min(0).default(0),
      }),
      use: [authProcedure({ required: true }), instancesProcedure()],
      handler: async ({ request, response, context }) => {
        const { id } = request.params as { id: string };
        const { limit, offset } = request.query;

        const user = context.auth?.session?.user;
        const repository = new InstancesRepository(context.db);

        // Verificar se instância existe
        const instance = await repository.findById(id);
        if (!instance) {
          return response.notFound("Instância não encontrada");
        }

        // Verificar permissão de acesso
        if (!checkOrganizationPermission(
          instance.organizationId,
          user?.currentOrgId || undefined,
          user?.role
        )) {
          return response.forbidden("Sem permissão para acessar esta instância");
        }

        // Buscar eventos
        const limitVal = limit || 50;
        const offsetVal = offset || 0;
        const result = await repository.getEvents(id, { limit: limitVal, offset: offsetVal });

        return response.success({
          events: result.events.map((event: any) => ({
            id: event.id,
            eventType: event.eventType,
            fromStatus: event.fromStatus,
            toStatus: event.toStatus,
            reason: event.reason,
            metadata: event.metadata,
            triggeredBy: event.triggeredBy,
            createdAt: event.createdAt,
          })),
          pagination: {
            total: result.total,
            limit: limitVal,
            offset: offsetVal,
            hasMore: offsetVal + result.events.length < result.total,
          },
        });
      },
    }),
  },
});
