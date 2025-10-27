/**
 * Organizations Repository
 * Data access layer for Organization entity
 */

import { database } from '@/services/database';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  ListOrganizationsQuery,
  AddMemberInput,
  UpdateMemberInput,
  OrganizationWithRelations,
  UserOrganizationWithUser,
} from './organizations.interfaces';
import type { Prisma } from '@prisma/client';

export class OrganizationsRepository {
  /**
   * Create a new organization with auto-generated slug
   */
  async create(data: CreateOrganizationInput): Promise<OrganizationWithRelations> {
    const slug = this.generateSlug(data.name);

    return database.organization.create({
      data: {
        ...data,
        slug,
        maxInstances: data.maxInstances ?? (data.type === 'pf' ? 1 : 5),
        maxUsers: data.maxUsers ?? (data.type === 'pf' ? 1 : 3),
        billingType: data.billingType ?? 'free',
      },
      include: {
        _count: {
          select: {
            users: true,
            connections: true,
            projects: true,
            webhooks: true,
          },
        },
      },
    });
  }

  /**
   * Find organization by ID with optional relations
   */
  async findById(id: string, includeRelations = false): Promise<OrganizationWithRelations | null> {
    return database.organization.findUnique({
      where: { id },
      include: includeRelations
        ? {
            _count: {
              select: {
                users: true,
                instances: true,
                projects: true,
              },
            },
          }
        : undefined,
    });
  }

  /**
   * Find organization by slug
   */
  async findBySlug(slug: string): Promise<OrganizationWithRelations | null> {
    return database.organization.findUnique({
      where: { slug },
      include: {
        _count: {
          select: {
            users: true,
            connections: true,
            projects: true,
            webhooks: true,
          },
        },
      },
    });
  }

  /**
   * Find organization by document (CPF/CNPJ)
   */
  async findByDocument(document: string): Promise<OrganizationWithRelations | null> {
    return database.organization.findUnique({
      where: { document },
    });
  }

  /**
   * List organizations with pagination and filters
   */
  async list(query: ListOrganizationsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrganizationWhereInput = {
      ...(query.type && { type: query.type }),
      ...(query.billingType && { billingType: query.billingType }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { document: { contains: query.search } },
          { slug: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      database.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              users: true,
              instances: true,
              projects: true,
            },
          },
        },
      }),
      database.organization.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update organization
   */
  async update(id: string, data: UpdateOrganizationInput): Promise<OrganizationWithRelations> {
    return database.organization.update({
      where: { id },
      data,
      include: {
        _count: {
          select: {
            users: true,
            connections: true,
            projects: true,
            webhooks: true,
          },
        },
      },
    });
  }

  /**
   * Delete organization (soft delete by setting isActive = false)
   */
  async softDelete(id: string): Promise<OrganizationWithRelations> {
    return database.organization.update({
      where: { id },
      data: { isActive: false },
      include: {
        _count: {
          select: {
            users: true,
            connections: true,
            projects: true,
            webhooks: true,
          },
        },
      },
    });
  }

  /**
   * Hard delete organization (cascade to all related entities)
   */
  async hardDelete(id: string): Promise<void> {
    await database.organization.delete({
      where: { id },
    });
  }

  // ============================================
  // MEMBERS MANAGEMENT
  // ============================================

  /**
   * Add member to organization
   */
  async addMember(organizationId: string, data: AddMemberInput): Promise<UserOrganizationWithUser> {
    return database.userOrganization.create({
      data: {
        userId: data.userId,
        organizationId,
        role: data.role,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
          },
        },
      },
    });
  }

  /**
   * List organization members
   */
  async listMembers(organizationId: string): Promise<UserOrganizationWithUser[]> {
    return database.userOrganization.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get specific member
   */
  async getMember(
    organizationId: string,
    userId: string
  ): Promise<UserOrganizationWithUser | null> {
    return database.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
          },
        },
      },
    });
  }

  /**
   * Update member role or status
   */
  async updateMember(
    organizationId: string,
    userId: string,
    data: UpdateMemberInput
  ): Promise<UserOrganizationWithUser> {
    return database.userOrganization.update({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      data,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
          },
        },
      },
    });
  }

  /**
   * Remove member from organization
   */
  async removeMember(organizationId: string, userId: string): Promise<void> {
    await database.userOrganization.delete({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });
  }

  /**
   * Check if user is member of organization
   */
  async isMember(organizationId: string, userId: string): Promise<boolean> {
    const member = await database.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });
    return member !== null && member.isActive;
  }

  /**
   * Get user's role in organization
   */
  async getUserRole(
    organizationId: string,
    userId: string
  ): Promise<'master' | 'manager' | 'user' | null> {
    const member = await database.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      select: { role: true, isActive: true },
    });

    if (!member || !member.isActive) {
      return null;
    }

    return member.role as 'master' | 'manager' | 'user';
  }

  /**
   * Count members in organization
   */
  async countMembers(organizationId: string): Promise<number> {
    return database.userOrganization.count({
      where: {
        organizationId,
        isActive: true,
      },
    });
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Generate URL-friendly slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Remove consecutive hyphens
      .trim();
  }

  /**
   * Check if organization has reached user limit
   */
  async hasReachedUserLimit(organizationId: string): Promise<boolean> {
    const org = await this.findById(organizationId);
    if (!org) return true;

    const currentCount = await this.countMembers(organizationId);
    return currentCount >= org.maxUsers;
  }

  /**
   * Check if organization has reached instance limit
   */
  async hasReachedInstanceLimit(organizationId: string): Promise<boolean> {
    const org = await this.findById(organizationId);
    if (!org) return true;

    const currentCount = await database.instance.count({
      where: { organizationId },
    });

    return currentCount >= org.maxInstances;
  }
}

// Export singleton instance
export const organizationsRepository = new OrganizationsRepository();
