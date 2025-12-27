/**
 * Chats Controller
 * Gerenciamento de conversas/chats via UAZapi
 */

import { igniter } from '@/igniter';
import { database } from '@/services/database';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { listChatsSchema, listAllChatsSchema, markAsReadSchema } from '../messages.schemas';
import { z } from 'zod';
import { ConnectionStatus } from '@prisma/client';
import { uazapiService } from '@/lib/api/uazapi.service';

/**
 * Cache TTL para listagem de chats (em segundos)
 * TTL aumentado para 60s - SSE garante atualizações em tempo real
 */
const CHATS_CACHE_TTL = 60; // 60 segundos (SSE garante real-time)

export const chatsController = igniter.controller({
  name: 'chats',
  path: '/chats',
  actions: {
    /**
     * GET /api/v1/chats/list
     * Listar conversas de uma instância
     */
    list: igniter.query({
      path: '/list',
      method: 'GET',
      query: listChatsSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const query = request.query as z.infer<typeof listChatsSchema>;
        const { instanceId } = query;

        // Buscar instância e verificar permissão
        const instance = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: {
              users: {
                some: { userId: userId },
              },
            },
          },
          select: {
            id: true,
            organizationId: true,
            uazapiToken: true,
            status: true,
            n8nWebhookUrl: true, // Incluir para verificar se IA está disponível na integração
          },
        });

        if (!instance) {
          return response.notFound('Instância não encontrada');
        }

        try {
          // 🚀 Cache: Verificar cache antes de buscar no banco
          const cacheKey = `chats:list:${instanceId}:${query.search || ''}:${query.status || ''}:${query.sessionStatus || ''}:${query.attendanceType || ''}:${query.offset || 0}:${query.limit || 20}`;

          try {
            const cached = await igniter.store.get<any>(cacheKey);
            if (cached) {
              return response.success({ ...cached, source: 'cache' });
            }
          } catch {
            // Cache miss ou erro - continuar sem cache
          }

          // Filtros
          const where: any = {
            connectionId: instanceId,
          };

          if (query.search) {
            where.contact = {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { phoneNumber: { contains: query.search } },
              ],
            };
          }

          if (query.status === 'groups') {
            where.contact = {
              ...where.contact,
              phoneNumber: { contains: '@g.us' }
            };
          }

          // Filtro por status da sessão
          if (query.sessionStatus) {
            where.status = query.sessionStatus;
          }

          // Filtro por tipo de atendimento (IA, Humano, Arquivado)
          // IMPORTANTE: IA só está disponível quando n8nWebhookUrl está configurado na conexão
          const connectionHasWebhook = !!instance.n8nWebhookUrl;
          const now = new Date();

          if (query.attendanceType === 'ai') {
            // Sessões com IA ativa:
            // 1. Conexão deve ter webhook configurado
            // 2. aiEnabled = true E (aiBlockedUntil é null OU já expirou)
            if (!connectionHasWebhook) {
              // Se conexão não tem webhook, nenhuma sessão pode ser IA
              where.id = 'NEVER_MATCH'; // Força resultado vazio
            } else {
              where.AND = [
                ...(where.AND || []),
                { aiEnabled: true },
                {
                  OR: [
                    { aiBlockedUntil: null },
                    { aiBlockedUntil: { lt: now } }
                  ]
                },
                // Exclui arquivados deste filtro
                { status: { notIn: ['CLOSED', 'PAUSED'] } }
              ];
            }
          } else if (query.attendanceType === 'human') {
            // Sessões com humano:
            // 1. Se conexão não tem webhook → todas são humanas (exceto arquivadas)
            // 2. Se tem webhook → aiEnabled = false OU aiBlockedUntil ainda não expirou
            if (!connectionHasWebhook) {
              // Sem webhook, todas sessões ativas são humanas
              where.status = { notIn: ['CLOSED', 'PAUSED'] };
            } else {
              where.AND = [
                ...(where.AND || []),
                {
                  OR: [
                    { aiEnabled: false },
                    { aiBlockedUntil: { gte: now } }
                  ]
                },
                // Exclui arquivados deste filtro
                { status: { notIn: ['CLOSED', 'PAUSED'] } }
              ];
            }
          } else if (query.attendanceType === 'archived') {
            // Sessões arquivadas: status é CLOSED ou PAUSED
            where.status = { in: ['CLOSED', 'PAUSED'] };
          }

          // Paginação
          const limit = query.limit || 20;
          const offset = query.offset || 0;

          const fetchLocalChats = async () => {
            return Promise.all([
              database.chatSession.findMany({
                where,
                include: {
                  contact: true,
                  messages: {
                    take: 1,
                    orderBy: { createdAt: 'desc' },
                  },
                },
                orderBy: { lastMessageAt: 'desc' },
                skip: offset,
                take: limit,
              }),
              database.chatSession.count({ where }),
            ]);
          };

          let [sessions, total] = await fetchLocalChats();

          // Lógica de Sync (Função isolada) - OTIMIZADA para evitar N+1
          const runSync = async () => {
            if (!instance.uazapiToken || instance.status !== ConnectionStatus.CONNECTED) return false;

            try {
              console.log('[ChatsController] Iniciando sync otimizado com UAZapi...');
              const uazChatsResponse = await uazapiService.findChats(instance.uazapiToken);
              const rawData = uazChatsResponse.data;
              const uazChats = Array.isArray(rawData) ? rawData : (rawData as any)?.chats || [];

              if (!Array.isArray(uazChats) || uazChats.length === 0) return false;

              console.log(`[ChatsController] Processando ${uazChats.length} chats em batch...`);

              // OTIMIZAÇÃO: Extrair todos os phoneNumbers primeiro
              // UAZapi uses wa_chatid as the chat identifier
              const phoneNumbers = uazChats
                .map(chat => chat.wa_chatid || chat.chatId || chat.id)
                .filter(Boolean) as string[];

              if (phoneNumbers.length === 0) return false;

              // OTIMIZAÇÃO: Buscar todos os contatos existentes em UMA query
              const existingContacts = await database.contact.findMany({
                where: { phoneNumber: { in: phoneNumbers } },
                select: { id: true, phoneNumber: true, profilePicUrl: true }
              });
              const contactsMap = new Map(existingContacts.map(c => [c.phoneNumber, c]));

              // Preparar dados para batch operations
              const contactsToCreate: any[] = [];
              const contactsToUpdate: { phoneNumber: string; data: any }[] = [];
              const numbersToFetchPics: string[] = [];

              for (const chat of uazChats) {
                // UAZapi uses wa_chatid as the chat identifier
                const phoneNumber = chat.wa_chatid || chat.chatId || chat.id;
                if (!phoneNumber) continue;

                const existingContact = contactsMap.get(phoneNumber);
                // UAZapi uses imagePreview for profile pictures
                let profilePicUrl = chat.imagePreview || chat.image || chat.imgUrl || chat.picUrl || chat.contact?.profilePicUrl || existingContact?.profilePicUrl || null;

                // Se não tem foto, adicionar à lista para buscar depois
                if (!profilePicUrl && !phoneNumber.includes('@g.us')) {
                  numbersToFetchPics.push(phoneNumber);
                }

                const contactData = {
                  name: chat.name || chat.wa_name || chat.formattedTitle || phoneNumber,
                  profilePicUrl,
                  verifiedName: chat.wa_contactName || chat.pushname || chat.name,
                  isBusiness: chat.isBusiness || false
                };

                if (existingContact) {
                  contactsToUpdate.push({
                    phoneNumber,
                    data: {
                      name: contactData.name,
                      verifiedName: contactData.verifiedName,
                      ...(contactData.profilePicUrl && { profilePicUrl: contactData.profilePicUrl }),
                    }
                  });
                } else {
                  contactsToCreate.push({
                    phoneNumber,
                    name: contactData.name,
                    profilePicUrl: contactData.profilePicUrl,
                    verifiedName: contactData.verifiedName,
                    isBusiness: contactData.isBusiness,
                    organizationId: instance.organizationId,
                    source: instance.id
                  });
                }
              }

              // OTIMIZAÇÃO: Batch create novos contatos
              if (contactsToCreate.length > 0) {
                await database.contact.createMany({
                  data: contactsToCreate,
                  skipDuplicates: true
                });
                console.log(`[ChatsController] ${contactsToCreate.length} contatos criados em batch.`);
              }

              // OTIMIZAÇÃO: Batch update contatos existentes usando transaction
              if (contactsToUpdate.length > 0) {
                await database.$transaction(
                  contactsToUpdate.map(({ phoneNumber, data }) =>
                    database.contact.update({
                      where: { phoneNumber },
                      data
                    })
                  )
                );
                console.log(`[ChatsController] ${contactsToUpdate.length} contatos atualizados em batch.`);
              }

              // OTIMIZAÇÃO: Buscar todos os contatos atualizados em UMA query
              const allContacts = await database.contact.findMany({
                where: { phoneNumber: { in: phoneNumbers } },
                select: { id: true, phoneNumber: true }
              });
              const updatedContactsMap = new Map(allContacts.map(c => [c.phoneNumber, c]));

              // OTIMIZAÇÃO: Buscar sessões existentes em UMA query
              const contactIds = allContacts.map(c => c.id);
              const existingSessions = await database.chatSession.findMany({
                where: {
                  connectionId: instance.id,
                  contactId: { in: contactIds }
                },
                select: { id: true, contactId: true }
              });
              const sessionsMap = new Map(existingSessions.map(s => [s.contactId, s]));

              // Preparar sessões para batch operations
              const sessionsToCreate: any[] = [];
              const sessionsToUpdate: { id: string; lastMessageAt: Date }[] = [];
              const sessionOrgId = instance.organizationId ?? undefined;

              for (const chat of uazChats) {
                // UAZapi uses wa_chatid as the chat identifier
                const phoneNumber = chat.wa_chatid || chat.chatId || chat.id;
                if (!phoneNumber) continue;

                const contact = updatedContactsMap.get(phoneNumber);
                if (!contact) continue;

                // UAZapi uses wa_lastMsgTimestamp (already in milliseconds)
                const ts = Number(chat.wa_lastMsgTimestamp || chat.lastMsgTimestamp);
                const lastMessageAt = !isNaN(ts) && ts > 0 ? new Date(ts) : new Date();

                const existingSession = sessionsMap.get(contact.id);
                if (existingSession) {
                  sessionsToUpdate.push({ id: existingSession.id, lastMessageAt });
                } else if (sessionOrgId) {
                  sessionsToCreate.push({
                    connectionId: instance.id,
                    contactId: contact.id,
                    organizationId: sessionOrgId,
                    status: 'ACTIVE',
                    lastMessageAt,
                    customerJourney: 'new'
                  });
                }
              }

              // OTIMIZAÇÃO: Batch create sessões
              if (sessionsToCreate.length > 0) {
                await database.chatSession.createMany({
                  data: sessionsToCreate,
                  skipDuplicates: true
                });
                console.log(`[ChatsController] ${sessionsToCreate.length} sessões criadas em batch.`);
              }

              // OTIMIZAÇÃO: Batch update sessões usando transaction
              if (sessionsToUpdate.length > 0) {
                await database.$transaction(
                  sessionsToUpdate.map(({ id, lastMessageAt }) =>
                    database.chatSession.update({
                      where: { id },
                      data: { lastMessageAt }
                    })
                  )
                );
                console.log(`[ChatsController] ${sessionsToUpdate.length} sessões atualizadas em batch.`);
              }

              // Buscar fotos de perfil em batch para contatos sem foto (limitado a 20)
              if (numbersToFetchPics.length > 0 && instance.uazapiToken) {
                const numbersToFetch = numbersToFetchPics.slice(0, 20);
                console.log(`[ChatsController] Buscando fotos de perfil para ${numbersToFetch.length} contatos...`);

                try {
                  const profilePics = await uazapiService.fetchContactsProfilePictures(
                    instance.uazapiToken,
                    numbersToFetch
                  );

                  // OTIMIZAÇÃO: Batch update fotos usando transaction
                  const picUpdates = Array.from(profilePics.entries())
                    .filter(([, url]) => url)
                    .map(([phoneNumber, profilePicUrl]) =>
                      database.contact.updateMany({
                        where: { phoneNumber: { contains: phoneNumber } },
                        data: { profilePicUrl }
                      })
                    );

                  if (picUpdates.length > 0) {
                    await database.$transaction(picUpdates);
                    console.log(`[ChatsController] ${picUpdates.length} fotos de perfil atualizadas em batch.`);
                  }
                } catch (picErr) {
                  console.warn('[ChatsController] Erro ao buscar fotos de perfil:', picErr);
                }
              }

              console.log('[ChatsController] Sync otimizado finalizado.');
              return true;
            } catch (err) {
              console.error('[ChatsController] Erro no sync:', err);
            }
            return false;
          };

          // Estratégia de Sync
          if (total === 0 && instance.status === ConnectionStatus.CONNECTED) {
            // Blocking Sync
            await runSync();
            // Refetch
            const [newSessions, newTotal] = await fetchLocalChats();
            sessions = newSessions;
            total = newTotal;
          } else if (instance.status === ConnectionStatus.CONNECTED) {
            // Background Sync
            setImmediate(() => runSync());
          }

          // Helper para formatar preview de mensagem baseada no tipo
          const formatMessagePreview = (msg: any): string => {
            if (!msg) return '';
            if (msg.content && msg.content.trim()) return msg.content;

            // Fallback para tipos de mídia
            const typeLabels: Record<string, string> = {
              'image': '📷 Imagem',
              'video': '🎥 Vídeo',
              'audio': '🎵 Áudio',
              'voice': '🎤 Mensagem de voz',
              'ptt': '🎤 Mensagem de voz',
              'document': '📄 Documento',
              'sticker': '🎨 Sticker',
              'location': '📍 Localização',
              'contact': '👤 Contato',
            };

            return typeLabels[msg.type] || `📎 ${msg.type || 'Mídia'}`;
          };

          // Mapper
          const mapSessionToChat = (session: any) => {
            const lastMsg = session.messages[0];
            const phoneNumber = session.contact.phoneNumber || '';
            const isGroup = phoneNumber.endsWith('@g.us') || phoneNumber.includes('-');

            // Formatar nome do contato corretamente
            // Prioridade: name do contato > verifiedName > formatar phoneNumber
            let displayName = session.contact.name;
            if (!displayName || displayName === phoneNumber) {
              displayName = session.contact.verifiedName;
            }
            if (!displayName || displayName === phoneNumber) {
              // Formatar número para exibição
              if (isGroup) {
                displayName = 'Grupo WhatsApp';
              } else {
                // Extrair apenas os números e formatar
                const cleanNumber = phoneNumber.replace(/@.*$/, '').replace(/\D/g, '');
                if (cleanNumber.length >= 10) {
                  // Formato brasileiro: +55 (11) 99999-9999
                  const countryCode = cleanNumber.slice(0, 2);
                  const areaCode = cleanNumber.slice(2, 4);
                  const part1 = cleanNumber.slice(4, 9);
                  const part2 = cleanNumber.slice(9);
                  displayName = `+${countryCode} (${areaCode}) ${part1}-${part2}`;
                } else {
                  displayName = cleanNumber || 'Contato';
                }
              }
            }

            // Extrair número limpo para exibição
            const cleanPhoneNumber = phoneNumber.replace(/@.*$/, '');

            return {
              // Session ID for proper identification
              id: session.id,
              wa_chatid: phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`,
              wa_name: displayName,
              wa_phoneNumber: cleanPhoneNumber, // Número limpo para exibição
              wa_profilePicUrl: session.contact.profilePicUrl,
              wa_isGroup: isGroup,
              wa_lastMsgTimestamp: session.lastMessageAt.getTime(),
              wa_lastMsgBody: formatMessagePreview(lastMsg),
              wa_unreadCount: 0,
              wa_isPinned: false,
              wa_isArchived: session.status === 'CLOSED',
              wa_isMuted: false,
              lead_status: session.customerJourney || null,
              lead_source: session.leadSource || 'whatsapp',
              created_at: session.createdAt.toISOString(),
              updated_at: session.updatedAt.toISOString(),
              // Campos de status e IA
              // IMPORTANTE: IA só está disponível quando:
              // 1. Conexão tem webhook configurado (n8nWebhookUrl)
              // 2. aiEnabled = true na sessão
              // 3. aiBlockedUntil não existe ou já expirou
              status: session.status,
              aiEnabled: session.aiEnabled ?? false,
              aiBlockedUntil: session.aiBlockedUntil?.toISOString() ?? null,
              // Indica se a conexão tem IA disponível (webhook configurado)
              connectionHasWebhook: connectionHasWebhook,
            };
          };

          const result = {
            chats: sessions.map(mapSessionToChat),
            pagination: {
              total,
              limit,
              offset,
              hasMore: offset + limit < total,
            },
          };

          // 🚀 Cache: Salvar resultado com TTL
          try {
            await igniter.store.set(cacheKey, result, { ttl: CHATS_CACHE_TTL });
          } catch {
            // Erro ao salvar cache - não crítico
          }

          return response.success(result);

        } catch (error: any) {
          console.error('[ChatsController] Erro geral:', error);
          return response.badRequest(`Erro ao buscar conversas: ${error.message}`);
        }
      },
    }),

    /**
     * GET /api/v1/chats/all
     * Endpoint unificado que busca chats de TODAS as instâncias do usuário
     * Elimina a necessidade de N requisições paralelas no frontend
     * Suporta cursor-based pagination para melhor performance
     */
    all: igniter.query({
      path: '/all',
      method: 'GET',
      query: listAllChatsSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const user = context.auth?.session?.user;
        const organizationId = user?.currentOrgId;
        const query = request.query as z.infer<typeof listAllChatsSchema>;

        console.log('[ChatsController.all] Request:', { userId, organizationId, instanceIds: query.instanceIds });

        try {
          // 1. Buscar todas as instâncias do usuário (usando organizationId como o endpoint de instances)
          // CORREÇÃO: Usar organizationId diretamente em vez de relação indireta
          const instanceFilter: any = {};

          // Filtrar por organização do usuário
          if (organizationId) {
            instanceFilter.organizationId = organizationId;
          } else {
            // Se usuário não tem organização, não retorna nada (segurança)
            console.warn('[ChatsController.all] User has no organizationId, returning empty');
            return response.success({
              chats: [],
              instances: [],
              pagination: { total: 0, limit: query.limit || 50, cursor: null, hasMore: false },
              counts: { ai: 0, human: 0, archived: 0, groups: 0 },
            });
          }

          if (query.instanceIds && query.instanceIds.length > 0) {
            instanceFilter.id = { in: query.instanceIds };
          }

          const instances = await database.connection.findMany({
            where: instanceFilter,
            select: {
              id: true,
              name: true,
              organizationId: true,
              n8nWebhookUrl: true,
              status: true,
            },
          });

          console.log('[ChatsController.all] Found instances:', instances.length, instances.map(i => ({ id: i.id, name: i.name, status: i.status })));

          if (instances.length === 0) {
            return response.success({
              chats: [],
              instances: [],
              pagination: {
                total: 0,
                limit: query.limit || 50,
                cursor: null,
                hasMore: false,
              },
              counts: { ai: 0, human: 0, archived: 0, groups: 0 },
            });
          }

          const instanceIds = instances.map(i => i.id);
          const instancesMap = new Map(instances.map(i => [i.id, i]));

          // 2. SYNC: Sincronizar chats do UAZapi
          // - Blocking sync quando não há sessões OU forceSync=true
          // - Isso garante que novos chats apareçam
          const connectedInstances = instances.filter(i => i.status === ConnectionStatus.CONNECTED);
          if (connectedInstances.length > 0) {
            // Check if we have ANY sessions for these instances
            const existingSessionCount = await database.chatSession.count({
              where: { connectionId: { in: instanceIds } },
            });

            // Rodar sync se: não há sessões OU forceSync foi solicitado
            const shouldSync = existingSessionCount === 0 || query.forceSync === true;

            if (shouldSync) {
              console.log(`[ChatsController.all] Running sync (forceSync=${query.forceSync}, existingSessions=${existingSessionCount})...`);

              // Fetch uazapiTokens for connected instances
              const instancesWithTokens = await database.connection.findMany({
                where: {
                  id: { in: connectedInstances.map(i => i.id) },
                  uazapiToken: { not: null },
                },
                select: {
                  id: true,
                  organizationId: true,
                  uazapiToken: true,
                },
              });

              // Run sync for each instance (in parallel for performance)
              await Promise.all(instancesWithTokens.map(async (inst) => {
                if (!inst.uazapiToken || !inst.organizationId) return;

                try {
                  console.log(`[ChatsController.all] Syncing instance ${inst.id}...`);
                  const uazChatsResponse = await uazapiService.findChats(inst.uazapiToken);

                  // Log response for debugging
                  console.log(`[ChatsController.all] UAZapi response for ${inst.id}:`, {
                    success: uazChatsResponse.success,
                    hasData: !!uazChatsResponse.data,
                    error: uazChatsResponse.error,
                    dataType: typeof uazChatsResponse.data,
                  });

                  if (!uazChatsResponse.success) {
                    console.error(`[ChatsController.all] findChats failed for ${inst.id}:`, uazChatsResponse.error);
                    return;
                  }

                  const rawData = uazChatsResponse.data;
                  const uazChats = Array.isArray(rawData) ? rawData : (rawData as any)?.chats || [];

                  console.log(`[ChatsController.all] Found ${uazChats.length} chats from UAZapi for instance ${inst.id}`);

                  if (!Array.isArray(uazChats) || uazChats.length === 0) return;

                  // Extract phone numbers - UAZapi uses wa_chatid as the chat identifier
                  // Format: "5511999999999@s.whatsapp.net" or "120363402662970051@g.us" for groups
                  const phoneNumbers = uazChats
                    .map(chat => chat.wa_chatid || chat.chatId || chat.id)
                    .filter(Boolean) as string[];

                  console.log(`[ChatsController.all] Extracted ${phoneNumbers.length} phone numbers`);
                  if (phoneNumbers.length === 0) return;

                  // Get existing contacts
                  const existingContacts = await database.contact.findMany({
                    where: { phoneNumber: { in: phoneNumbers } },
                    select: { id: true, phoneNumber: true },
                  });
                  const contactsMap = new Map(existingContacts.map(c => [c.phoneNumber, c]));

                  // Create missing contacts
                  const contactsToCreate: any[] = [];
                  for (const chat of uazChats) {
                    const phoneNumber = chat.wa_chatid || chat.chatId || chat.id;
                    if (!phoneNumber || contactsMap.has(phoneNumber)) continue;

                    contactsToCreate.push({
                      phoneNumber,
                      name: chat.name || chat.wa_name || chat.formattedTitle || phoneNumber,
                      profilePicUrl: chat.imagePreview || chat.image || chat.imgUrl || chat.picUrl || null,
                      verifiedName: chat.wa_contactName || chat.pushname || chat.name,
                      isBusiness: chat.isBusiness || false,
                      organizationId: inst.organizationId,
                      source: inst.id,
                    });
                  }

                  if (contactsToCreate.length > 0) {
                    await database.contact.createMany({ data: contactsToCreate, skipDuplicates: true });
                  }

                  // Refetch all contacts
                  const allContacts = await database.contact.findMany({
                    where: { phoneNumber: { in: phoneNumbers } },
                    select: { id: true, phoneNumber: true },
                  });
                  const updatedContactsMap = new Map(allContacts.map(c => [c.phoneNumber, c]));

                  // CORREÇÃO: Buscar sessões existentes para evitar duplicatas
                  const contactIds = allContacts.map(c => c.id);
                  const existingSessions = await database.chatSession.findMany({
                    where: {
                      connectionId: inst.id,
                      contactId: { in: contactIds }
                    },
                    select: { id: true, contactId: true }
                  });
                  const existingSessionsMap = new Map(existingSessions.map(s => [s.contactId, s]));

                  // Create/update sessions
                  const sessionsToCreate: any[] = [];
                  const sessionsToUpdate: { id: string; lastMessageAt: Date }[] = [];

                  for (const chat of uazChats) {
                    const phoneNumber = chat.wa_chatid || chat.chatId || chat.id;
                    if (!phoneNumber) continue;

                    const contact = updatedContactsMap.get(phoneNumber);
                    if (!contact) continue;

                    // UAZapi uses wa_lastMsgTimestamp (in milliseconds)
                    const ts = Number(chat.wa_lastMsgTimestamp || chat.lastMsgTimestamp);
                    const lastMessageAt = !isNaN(ts) && ts > 0 ? new Date(ts) : new Date();

                    const existingSession = existingSessionsMap.get(contact.id);
                    if (existingSession) {
                      // Update existing session
                      sessionsToUpdate.push({ id: existingSession.id, lastMessageAt });
                    } else {
                      // Create new session
                      sessionsToCreate.push({
                        connectionId: inst.id,
                        contactId: contact.id,
                        organizationId: inst.organizationId,
                        status: 'ACTIVE',
                        lastMessageAt,
                        customerJourney: 'new',
                      });
                    }
                  }

                  if (sessionsToCreate.length > 0) {
                    await database.chatSession.createMany({ data: sessionsToCreate, skipDuplicates: true });
                    console.log(`[ChatsController.all] Created ${sessionsToCreate.length} sessions for instance ${inst.id}`);
                  }

                  // Update existing sessions timestamps in batch
                  if (sessionsToUpdate.length > 0) {
                    await database.$transaction(
                      sessionsToUpdate.map(({ id, lastMessageAt }) =>
                        database.chatSession.update({
                          where: { id },
                          data: { lastMessageAt }
                        })
                      )
                    );
                    console.log(`[ChatsController.all] Updated ${sessionsToUpdate.length} sessions for instance ${inst.id}`);
                  }
                } catch (err) {
                  console.error(`[ChatsController.all] Sync failed for instance ${inst.id}:`, err);
                }
              }));
            }
          }

          // 3. Cache check (skip if forceSync)
          const cacheKey = `chats:all:${userId}:${instanceIds.sort().join(',')}:${query.search || ''}:${query.attendanceType || ''}:${query.cursor || '0'}:${query.limit || 50}`;
          if (!query.forceSync) {
            try {
              const cached = await igniter.store.get<any>(cacheKey);
              if (cached) {
                return response.success({ ...cached, source: 'cache' });
              }
            } catch {
              // Cache miss - continue
            }
          }

          // 4. Build filters for unified query
          const now = new Date();
          const where: any = {
            connectionId: { in: instanceIds },
          };

          // Search filter
          if (query.search) {
            where.contact = {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { phoneNumber: { contains: query.search } },
              ],
            };
          }

          // Groups filter
          if (query.status === 'groups') {
            where.contact = {
              ...where.contact,
              phoneNumber: { contains: '@g.us' },
            };
          }

          // Session status filter
          if (query.sessionStatus) {
            where.status = query.sessionStatus;
          }

          // 5. Attendance type filter (more complex with multi-instance)
          // For unified endpoint, we need to handle per-instance webhook status
          if (query.attendanceType === 'ai') {
            // Only instances with webhook can have AI sessions
            const instancesWithWebhook = instances.filter(i => !!i.n8nWebhookUrl).map(i => i.id);
            if (instancesWithWebhook.length === 0) {
              // No instances have webhook - return empty
              return response.success({
                chats: [],
                instances: instances.map(i => ({ id: i.id, name: i.name, status: i.status })),
                pagination: { total: 0, limit: query.limit || 50, cursor: null, hasMore: false },
                counts: { ai: 0, human: 0, archived: 0, groups: 0 },
              });
            }
            where.connectionId = { in: instancesWithWebhook };
            where.AND = [
              ...(where.AND || []),
              { aiEnabled: true },
              {
                OR: [
                  { aiBlockedUntil: null },
                  { aiBlockedUntil: { lt: now } },
                ],
              },
              { status: { notIn: ['CLOSED', 'PAUSED'] } },
            ];
          } else if (query.attendanceType === 'human') {
            const instancesWithWebhook = instances.filter(i => !!i.n8nWebhookUrl).map(i => i.id);
            const instancesWithoutWebhook = instances.filter(i => !i.n8nWebhookUrl).map(i => i.id);

            // Human = (instances without webhook) OR (instances with webhook but AI disabled/blocked)
            where.AND = [
              ...(where.AND || []),
              { status: { notIn: ['CLOSED', 'PAUSED'] } },
              {
                OR: [
                  // All sessions from instances without webhook
                  { connectionId: { in: instancesWithoutWebhook } },
                  // Sessions from instances with webhook but AI is disabled or blocked
                  {
                    connectionId: { in: instancesWithWebhook },
                    OR: [
                      { aiEnabled: false },
                      { aiBlockedUntil: { gte: now } },
                    ],
                  },
                ],
              },
            ];
          } else if (query.attendanceType === 'archived') {
            where.status = { in: ['CLOSED', 'PAUSED'] };
          }

          // 6. Pagination (cursor-based or offset-based)
          const limit = query.limit || 50;
          let paginationOptions: any = {
            take: limit + 1, // Take one extra to check if there's more
            orderBy: { lastMessageAt: 'desc' as const },
          };

          if (query.cursor) {
            // Cursor-based: cursor is the ID of the last item
            paginationOptions.cursor = { id: query.cursor };
            paginationOptions.skip = 1; // Skip the cursor item itself
          } else if (query.offset) {
            // Fallback to offset-based
            paginationOptions.skip = query.offset;
          }

          // 7. Fetch sessions with all necessary data
          const [sessions, totalCount] = await Promise.all([
            database.chatSession.findMany({
              where,
              include: {
                contact: true,
                messages: {
                  take: 1,
                  orderBy: { createdAt: 'desc' },
                },
                connection: {
                  select: {
                    id: true,
                    name: true,
                    n8nWebhookUrl: true,
                    status: true,
                  },
                },
              },
              ...paginationOptions,
            }),
            // Get total count for stats (without pagination)
            database.chatSession.count({ where }),
          ]);

          // Check if there's more data
          const hasMore = sessions.length > limit;
          const resultSessions = hasMore ? sessions.slice(0, limit) : sessions;
          const nextCursor = hasMore ? resultSessions[resultSessions.length - 1]?.id : null;

          // 8. Calculate counts for tabs (from ALL sessions matching base filters)
          // We need counts without attendance type filter
          const baseWhere: any = { connectionId: { in: instanceIds } };
          if (query.search) {
            baseWhere.contact = {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { phoneNumber: { contains: query.search } },
              ],
            };
          }

          const [allSessions, archivedCount, groupsCount] = await Promise.all([
            database.chatSession.findMany({
              where: {
                ...baseWhere,
                status: { notIn: ['CLOSED', 'PAUSED'] },
              },
              select: {
                id: true,
                aiEnabled: true,
                aiBlockedUntil: true,
                connectionId: true,
                contact: { select: { phoneNumber: true } },
              },
            }),
            database.chatSession.count({
              where: { ...baseWhere, status: { in: ['CLOSED', 'PAUSED'] } },
            }),
            database.chatSession.count({
              where: {
                ...baseWhere,
                status: { notIn: ['CLOSED', 'PAUSED'] },
                contact: { phoneNumber: { contains: '@g.us' } },
              },
            }),
          ]);

          // Calculate AI and Human counts
          let aiCount = 0;
          let humanCount = 0;
          for (const s of allSessions) {
            const inst = instancesMap.get(s.connectionId);
            const hasWebhook = !!inst?.n8nWebhookUrl;
            const aiNotBlocked = !s.aiBlockedUntil || new Date(s.aiBlockedUntil) < now;

            if (hasWebhook && s.aiEnabled && aiNotBlocked) {
              aiCount++;
            } else {
              humanCount++;
            }
          }

          // 9. Map sessions to chat format with instance info
          const formatMessagePreview = (msg: any): string => {
            if (!msg) return '';
            if (msg.content && msg.content.trim()) return msg.content;
            const typeLabels: Record<string, string> = {
              image: '📷 Imagem',
              video: '🎥 Vídeo',
              audio: '🎵 Áudio',
              voice: '🎤 Mensagem de voz',
              ptt: '🎤 Mensagem de voz',
              document: '📄 Documento',
              sticker: '🎨 Sticker',
              location: '📍 Localização',
              contact: '👤 Contato',
            };
            return typeLabels[msg.type] || `📎 ${msg.type || 'Mídia'}`;
          };

          const chats = resultSessions.map((session: any) => {
            const lastMsg = session.messages[0];
            const phoneNumber = session.contact.phoneNumber || '';
            const isGroup = phoneNumber.endsWith('@g.us') || phoneNumber.includes('-');
            const instance = instancesMap.get(session.connectionId);
            const connectionHasWebhook = !!instance?.n8nWebhookUrl;

            // Format contact name
            let displayName = session.contact.name;
            if (!displayName || displayName === phoneNumber) {
              displayName = session.contact.verifiedName;
            }
            if (!displayName || displayName === phoneNumber) {
              if (isGroup) {
                displayName = 'Grupo WhatsApp';
              } else {
                const cleanNumber = phoneNumber.replace(/@.*$/, '').replace(/\D/g, '');
                if (cleanNumber.length >= 10) {
                  const countryCode = cleanNumber.slice(0, 2);
                  const areaCode = cleanNumber.slice(2, 4);
                  const part1 = cleanNumber.slice(4, 9);
                  const part2 = cleanNumber.slice(9);
                  displayName = `+${countryCode} (${areaCode}) ${part1}-${part2}`;
                } else {
                  displayName = cleanNumber || 'Contato';
                }
              }
            }

            return {
              id: session.id,
              wa_chatid: phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`,
              wa_name: displayName,
              wa_phoneNumber: phoneNumber.replace(/@.*$/, ''),
              wa_profilePicUrl: session.contact.profilePicUrl,
              wa_isGroup: isGroup,
              wa_lastMsgTimestamp: session.lastMessageAt.getTime(),
              wa_lastMsgBody: formatMessagePreview(lastMsg),
              wa_unreadCount: 0,
              wa_isPinned: false,
              wa_isArchived: session.status === 'CLOSED',
              wa_isMuted: false,
              lead_status: session.customerJourney || null,
              lead_source: session.leadSource || 'whatsapp',
              created_at: session.createdAt.toISOString(),
              updated_at: session.updatedAt.toISOString(),
              status: session.status,
              aiEnabled: session.aiEnabled ?? false,
              aiBlockedUntil: session.aiBlockedUntil?.toISOString() ?? null,
              connectionHasWebhook,
              // Instance info attached to each chat
              instanceId: session.connectionId,
              instanceName: instance?.name || 'Instância',
            };
          });

          const result = {
            chats,
            instances: instances.map(i => ({
              id: i.id,
              name: i.name,
              status: i.status,
              hasWebhook: !!i.n8nWebhookUrl,
            })),
            pagination: {
              total: totalCount,
              limit,
              cursor: nextCursor,
              hasMore,
            },
            counts: {
              ai: aiCount,
              human: humanCount,
              archived: archivedCount,
              groups: groupsCount,
            },
          };

          // 10. Cache result
          try {
            await igniter.store.set(cacheKey, result, { ttl: CHATS_CACHE_TTL });
          } catch {
            // Cache error - non-critical
          }

          return response.success(result);
        } catch (error: any) {
          console.error('[ChatsController] Erro no endpoint all:', error);
          return response.badRequest(`Erro ao buscar conversas: ${error.message}`);
        }
      },
    }),

    /**
     * GET /api/v1/chats/count
     */
    count: igniter.query({
      path: '/count',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { instanceId } = request.query as { instanceId: string };

        if (!instanceId) return response.badRequest('instanceId é obrigatório');

        const instance = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: { users: { some: { userId } } },
          },
        });

        if (!instance) return response.notFound('Instância não encontrada');

        try {
          const [total, groups] = await Promise.all([
            database.chatSession.count({ where: { connectionId: instanceId } }),
            database.chatSession.count({
              where: {
                connectionId: instanceId,
                contact: { phoneNumber: { contains: '@g.us' } }
              }
            })
          ]);

          return response.success({
            total_chats: total,
            unread_chats: 0,
            groups: groups,
            pinned_chats: 0,
          });
        } catch (error) {
          return response.success({
            total_chats: 0,
            unread_chats: 0,
            groups: 0,
            pinned_chats: 0,
          });
        }
      },
    }),

    /**
     * POST /api/v1/chats/mark-read
     */
    markAsRead: igniter.mutation({
      path: '/mark-read',
      method: 'POST',
      body: markAsReadSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const body = request.body;

        const instance = await database.connection.findFirst({
          where: {
            id: body.instanceId,
            organization: { users: { some: { userId } } },
          },
        });

        if (!instance) return response.notFound('Instância não encontrada');
        if (instance.status !== ConnectionStatus.CONNECTED || !instance.uazapiToken) {
          return response.badRequest('Instância não está conectada');
        }

        const result = await uazapiService.markAsRead(instance.uazapiToken, body.chatId);
        if (!result.success) {
          return response.badRequest(result.error || 'Erro ao marcar chat como lido');
        }
        return response.success({ message: 'Chat marcado como lido' });
      },
    }),

    /**
     * POST /api/v1/chats/:chatId/archive
     */
    archive: igniter.mutation({
      path: '/:chatId/archive',
      method: 'POST',
      body: z.object({ instanceId: z.string().uuid() }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { chatId } = request.params as { chatId: string };
        const { instanceId } = request.body;

        const instance = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: { users: { some: { userId } } },
          },
        });

        if (!instance) return response.notFound('Instância não encontrada');
        if (instance.status !== ConnectionStatus.CONNECTED || !instance.uazapiToken) {
          return response.badRequest('Instância não está conectada');
        }

        const result = await uazapiService.archiveChat(instance.uazapiToken, chatId, true);
        if (!result.success) {
          return response.badRequest(result.error || 'Erro ao arquivar chat');
        }

        // Also close the local session
        const phoneNumber = chatId.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
        const contact = await database.contact.findUnique({
          where: { phoneNumber },
        });

        if (contact) {
          await database.chatSession.updateMany({
            where: {
              connectionId: instanceId,
              contactId: contact.id,
              status: { in: ['QUEUED', 'ACTIVE'] },
            },
            data: {
              status: 'CLOSED',
              closedAt: new Date(),
              endReason: 'Arquivado manualmente pelo usuário',
            },
          });
        }

        return response.success({ message: 'Chat arquivado com sucesso' });
      },
    }),

    /**
     * POST /api/v1/chats/:chatId/unarchive
     * Restore an archived chat session
     */
    unarchive: igniter.mutation({
      path: '/:chatId/unarchive',
      method: 'POST',
      body: z.object({ instanceId: z.string().uuid() }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { chatId } = request.params as { chatId: string };
        const { instanceId } = request.body;

        const instance = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: { users: { some: { userId } } },
          },
        });

        if (!instance) return response.notFound('Instância não encontrada');
        if (instance.status !== ConnectionStatus.CONNECTED || !instance.uazapiToken) {
          return response.badRequest('Instância não está conectada');
        }

        // Unarchive on UAZapi
        const result = await uazapiService.archiveChat(instance.uazapiToken, chatId, false);
        if (!result.success) {
          return response.badRequest(result.error || 'Erro ao desarquivar chat');
        }

        // Also reactivate the local session
        const phoneNumber = chatId.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
        const contact = await database.contact.findUnique({
          where: { phoneNumber },
        });

        if (contact) {
          await database.chatSession.updateMany({
            where: {
              connectionId: instanceId,
              contactId: contact.id,
              status: 'CLOSED',
            },
            data: {
              status: 'ACTIVE',
              closedAt: null,
              endReason: null,
            },
          });
        }

        return response.success({ message: 'Chat desarquivado com sucesso' });
      },
    }),

    /**
     * DELETE /api/v1/chats/:chatId
     */
    delete: igniter.mutation({
      path: '/:chatId',
      method: 'DELETE',
      body: z.object({ instanceId: z.string().uuid() }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { chatId } = request.params as { chatId: string };
        const { instanceId } = request.body;

        const instance = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: { users: { some: { userId } } },
          },
        });

        if (!instance) return response.notFound('Instância não encontrada');
        if (instance.status !== ConnectionStatus.CONNECTED || !instance.uazapiToken) {
          return response.badRequest('Instância não está conectada');
        }

        const result = await uazapiService.deleteChat(instance.uazapiToken, chatId);
        if (!result.success) {
          return response.badRequest(result.error || 'Erro ao deletar chat');
        }

        // Limpar sessão local
        await database.chatSession.deleteMany({
          where: {
            connectionId: instanceId,
            contact: { phoneNumber: chatId.replace('@s.whatsapp.net', '').replace('@g.us', '') },
          },
        });

        return response.noContent();
      },
    }),

    /**
     * POST /api/v1/chats/:chatId/block
     */
    block: igniter.mutation({
      path: '/:chatId/block',
      method: 'POST',
      body: z.object({
        instanceId: z.string().uuid(),
        block: z.boolean().default(true),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { chatId } = request.params as { chatId: string };
        const { instanceId, block } = request.body;

        const instance = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: { users: { some: { userId } } },
          },
        });

        if (!instance) return response.notFound('Instância não encontrada');
        if (!instance.uazapiToken) {
          return response.badRequest('Instância sem token configurado');
        }

        const result = await uazapiService.blockContact(instance.uazapiToken, chatId, block);
        if (!result.success) {
          return response.badRequest(result.error || `Erro ao ${block ? 'bloquear' : 'desbloquear'}`);
        }
        return response.success({ message: block ? 'Bloqueado' : 'Desbloqueado' });
      },
    }),
  },
});
