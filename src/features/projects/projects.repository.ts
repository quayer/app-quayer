/**
 * Projects Repository
 * Data access layer for Project entity
 */

import { database } from '@/services/database';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ListProjectsQuery,
  ProjectWithRelations,
} from './projects.interfaces';
import type { Prisma } from '@prisma/client';

export class ProjectsRepository {
  /**
   * Create a new project
   */
  async create(data: CreateProjectInput): Promise<ProjectWithRelations> {
    return database.project.create({
      data,
      include: {
        _count: {
          select: {
            connections: true,
          },
        },
      },
    });
  }

  /**
   * Find project by ID
   */
  async findById(id: string, includeRelations = false): Promise<ProjectWithRelations | null> {
    return database.project.findUnique({
      where: { id },
      include: includeRelations
        ? {
            _count: {
              select: {
                connections: true,
              },
            },
            connections: true,
          }
        : undefined,
    });
  }

  /**
   * Find project by name in organization
   */
  async findByName(name: string, organizationId: string): Promise<ProjectWithRelations | null> {
    return database.project.findFirst({
      where: {
        name,
        organizationId,
      },
    });
  }

  /**
   * List projects with pagination and filters
   */
  async list(query: ListProjectsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProjectWhereInput = {
      ...(query.organizationId && { organizationId: query.organizationId }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      database.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              connections: true,
            },
          },
        },
      }),
      database.project.count({ where }),
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
   * Update project
   */
  async update(id: string, data: UpdateProjectInput): Promise<ProjectWithRelations> {
    return database.project.update({
      where: { id },
      data,
      include: {
        _count: {
          select: {
            connections: true,
          },
        },
      },
    });
  }

  /**
   * Soft delete project
   */
  async softDelete(id: string): Promise<ProjectWithRelations> {
    return database.project.update({
      where: { id },
      data: { isActive: false },
      include: {
        _count: {
          select: {
            connections: true,
          },
        },
      },
    });
  }

  /**
   * Hard delete project
   */
  async hardDelete(id: string): Promise<void> {
    await database.project.delete({
      where: { id },
    });
  }

  /**
   * Link connection to project
   */
  async linkConnection(projectId: string, connectionId: string): Promise<void> {
    await database.connection.update({
      where: { id: connectionId },
      data: { projectId },
    });
  }

  /**
   * Unlink connection from project
   */
  async unlinkConnection(connectionId: string): Promise<void> {
    await database.connection.update({
      where: { id: connectionId },
      data: { projectId: null },
    });
  }

  /**
   * List connections in project
   */
  async listConnections(projectId: string) {
    return database.connection.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Count connections in project
   */
  async countConnections(projectId: string): Promise<number> {
    return database.connection.count({
      where: { projectId },
    });
  }
}

// Export singleton instance
export const projectsRepository = new ProjectsRepository();
