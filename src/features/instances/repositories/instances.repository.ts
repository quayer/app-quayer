import { PrismaClient, Connection as Instance, ConnectionStatus } from "@prisma/client";
import { CreateInstanceInput, UpdateInstanceInput } from "../instances.interfaces";

/**
 * @class InstancesRepository
 * @description Repository para gerenciamento de instâncias WhatsApp no banco de dados
 * Centraliza todas as operações de banco de dados relacionadas às instâncias
 */
export class InstancesRepository {
  private prisma: PrismaClient;

  /**
   * @param {PrismaClient} prisma - Cliente Prisma para acesso ao banco de dados
   */
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * @method create
   * @description Cria uma nova instância no banco de dados
   * @param {CreateInstanceInput} data - Dados da instância a ser criada
   * @returns {Promise<Instance>} Instância criada
   */
  async create(data: CreateInstanceInput): Promise<Instance> {
    // Business Logic: Criar nova instância no banco de dados usando Prisma
    // Use type assertion to satisfy Prisma's discriminated union type
    return this.prisma.connection.create({ data: data as any });
  }

  /**
   * @method findAll
   * @description Busca todas as instâncias do banco de dados (com filtro opcional por organização)
   * @param {string} organizationId - ID da organização para filtrar (opcional)
   * @returns {Promise<Instance[]>} Lista de todas as instâncias
   */
  async findAll(organizationId?: string): Promise<any[]> {
    // Business Logic: Buscar todas as instâncias ordenadas por data de criação
    return this.prisma.connection.findMany({
      where: organizationId ? { organizationId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          }
        }
      }
    });
  }

  /**
   * @method findAllPaginated
   * @description Busca instâncias com paginação e filtros
   * @param {object} params - Parâmetros de paginação e filtro
   * @returns {Promise<{instances: Instance[], total: number}>} Instâncias paginadas e total
   */
  async findAllPaginated(params: {
    organizationId?: string;
    page: number;
    limit: number;
    status?: string;
    search?: string;
  }): Promise<{ instances: Instance[]; total: number }> {
    const { organizationId, page, limit, status, search } = params;

    // Build where clause
    const where: any = {};

    if (organizationId) {
      where.organizationId = organizationId;
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Execute queries in parallel
    const [instances, total] = await Promise.all([
      this.prisma.connection.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            }
          }
        }
      }),
      this.prisma.connection.count({ where }),
    ]);

    return { instances, total };
  }

  /**
   * @method findById
   * @description Busca uma instância pelo ID
   * @param {string} id - ID da instância
   * @returns {Promise<Instance | null>} Instância encontrada ou null
   */
  async findById(id: string): Promise<any | null> {
    // Business Logic: Buscar instância por ID usando Prisma
    return this.prisma.connection.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          }
        }
      }
    });
  }

  /**
   * @method findByName
   * @description Busca uma instância pelo nome
   * @param {string} name - Nome da instância
   * @returns {Promise<Instance | null>} Instância encontrada ou null
   */
  async findByName(name: string): Promise<Instance | null> {
    // Business Logic: Buscar instância por nome usando Prisma
    return this.prisma.connection.findFirst({
      where: { name }
    });
  }

  /**
   * @method update
   * @description Atualiza uma instância existente
   * @param {string} id - ID da instância
   * @param {UpdateInstanceInput} data - Dados para atualização
   * @returns {Promise<Instance>} Instância atualizada
   */
  async update(id: string, data: UpdateInstanceInput): Promise<Instance> {
    // Business Logic: Atualizar instância no banco de dados
    return this.prisma.connection.update({
      where: { id },
      data
    });
  }

  /**
   * @method updateStatus
   * @description Atualiza apenas o status de uma instância
   * @param {string} id - ID da instância
   * @param {string} status - Novo status
   * @param {string} phoneNumber - Número do telefone (opcional)
   * @param {string} profilePictureUrl - URL da foto de perfil (opcional)
   * @returns {Promise<Instance>} Instância atualizada
   */
  async updateStatus(
    id: string,
    status: string,
    phoneNumber?: string,
    profilePictureUrl?: string | null
  ): Promise<Instance> {
    // Business Logic: Atualizar status e dados relacionados da instância
    return this.prisma.connection.update({
      where: { id },
      data: {
        status: status as ConnectionStatus,
        ...(phoneNumber && { phoneNumber }),
        ...(profilePictureUrl !== undefined && { profilePictureUrl }),
        ...(status === 'CONNECTED' && { lastConnected: new Date() })
      }
    });
  }

  /**
   * @method updateQRCode
   * @description Atualiza o QR Code e código de pareamento de uma instância
   * @param {string} id - ID da instância
   * @param {string} qrCode - QR Code base64
   * @param {string} pairingCode - Código de pareamento (opcional)
   * @returns {Promise<Instance>} Instância atualizada
   */
  async updateQRCode(id: string, qrCode: string, pairingCode?: string): Promise<Instance> {
    // Business Logic: Atualizar QR Code e código de pareamento
    return this.prisma.connection.update({
      where: { id },
      data: {
        qrCode,
        ...(pairingCode && { pairingCode }),
        status: 'CONNECTING'
      }
    });
  }

  /**
   * @method clearQRCode
   * @description Remove o QR Code de uma instância
   * @param {string} id - ID da instância
   * @returns {Promise<Instance>} Instância atualizada
   */
  async clearQRCode(id: string): Promise<Instance> {
    // Business Logic: Limpar QR Code e código de pareamento
    return this.prisma.connection.update({
      where: { id },
      data: {
        qrCode: null,
        pairingCode: null
      }
    });
  }

  /**
   * @method delete
   * @description Remove uma instância do banco de dados
   * @param {string} id - ID da instância
   * @returns {Promise<Instance>} Instância removida
   */
  async delete(id: string): Promise<Instance> {
    // Business Logic: Remover instância do banco de dados
    return this.prisma.connection.delete({
      where: { id }
    });
  }

  /**
   * @method count
   * @description Conta o total de instâncias no banco
   * @returns {Promise<number>} Número total de instâncias
   */
  async count(): Promise<number> {
    // Business Logic: Contar total de connections (tabela real no schema)
    return this.prisma.connection.count();
  }

  /**
   * @method countByStatus
   * @description Conta instâncias por status
   * @param {string} status - Status para filtrar
   * @returns {Promise<number>} Número de instâncias com o status
   */
  async countByStatus(status: string): Promise<number> {
    // Business Logic: Contar instâncias por status específico
    return this.prisma.connection.count({
      where: { status: status as ConnectionStatus }
    });
  }

  /**
   * @method findByShareToken
   * @description Busca instância pelo token de compartilhamento
   * @param {string} shareToken - Token de compartilhamento
   * @returns {Promise<Instance | null>} Instância encontrada ou null
   */
  async findByShareToken(shareToken: string): Promise<Instance | null> {
    // Business Logic: Buscar instância pelo token de compartilhamento com dados da organização
    return this.prisma.connection.findFirst({
      where: {
        shareToken,
        shareTokenExpiresAt: {
          gt: new Date() // Apenas tokens não expirados
        }
      },
      include: {
        organization: true
      }
    });
  }

  /**
   * @method updateShareToken
   * @description Atualiza token de compartilhamento de uma instância
   * @param {string} id - ID da instância
   * @param {object} shareData - Dados do token de compartilhamento
   * @returns {Promise<Instance>} Instância atualizada
   */
  async updateShareToken(id: string, shareData: {
    shareToken: string;
    shareTokenExpiresAt: Date;
  }): Promise<Instance> {
    // Business Logic: Atualizar token de compartilhamento
    return this.prisma.connection.update({
      where: { id },
      data: shareData
    });
  }

  /**
   * @method revokeShareToken
   * @description Revoga token de compartilhamento (define como expirado)
   * @param {string} id - ID da instância
   * @returns {Promise<Instance>} Instância atualizada
   */
  async revokeShareToken(id: string): Promise<Instance> {
    // Business Logic: Revogar token definindo expiração no passado
    return this.prisma.connection.update({
      where: { id },
      data: {
        shareToken: null,
        shareTokenExpiresAt: new Date(0) // Data no passado
      }
    });
  }
}
