/**
 * Projects Feature - Type Definitions
 */

import type { Project, Connection } from '@prisma/client';

// ============================================
// Database Types with Relations
// ============================================

export type ProjectWithRelations = Project & {
  connections?: Connection[];
  _count?: {
    connections: number;
  };
};

// ============================================
// API Request/Response Types
// ============================================

export interface CreateProjectInput {
  name: string;
  description?: string;
  organizationId: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface ListProjectsQuery {
  page?: number;
  limit?: number;
  search?: string;
  organizationId?: string;
  isActive?: boolean;
}

export interface LinkConnectionInput {
  connectionId: string;
}

// ============================================
// API Response Types
// ============================================

export interface ProjectResponse {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  stats?: {
    connectionsCount: number;
  };
}

export interface PaginatedProjectsResponse {
  data: ProjectResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
