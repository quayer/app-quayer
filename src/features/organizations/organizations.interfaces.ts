/**
 * Organizations Feature - Type Definitions
 */

import type { Organization, UserOrganization, User } from '@prisma/client';

// ============================================
// Database Types with Relations
// ============================================

export type OrganizationWithRelations = Organization & {
  users?: UserOrganization[];
  _count?: {
    users: number;
    instances: number;
    projects: number;
  };
};

export type UserOrganizationWithUser = UserOrganization & {
  user: Pick<User, 'id' | 'email' | 'name' | 'isActive'>;
};

// ============================================
// API Request/Response Types
// ============================================

export interface CreateOrganizationInput {
  name: string;
  document: string; // CPF or CNPJ
  type: 'pf' | 'pj';
  maxInstances?: number;
  maxUsers?: number;
  billingType?: 'free' | 'basic' | 'pro';
}

export interface UpdateOrganizationInput {
  name?: string;
  maxInstances?: number;
  maxUsers?: number;
  billingType?: 'free' | 'basic' | 'pro';
  isActive?: boolean;
}

export interface ListOrganizationsQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: 'pf' | 'pj';
  billingType?: 'free' | 'basic' | 'pro';
  isActive?: boolean;
}

export interface AddMemberInput {
  userId: string;
  role: 'master' | 'manager' | 'user';
}

export interface UpdateMemberInput {
  role?: 'master' | 'manager' | 'user';
  isActive?: boolean;
}

// ============================================
// API Response Types
// ============================================

export interface OrganizationResponse {
  id: string;
  name: string;
  slug: string;
  document: string;
  type: 'pf' | 'pj';
  maxInstances: number;
  maxUsers: number;
  billingType: 'free' | 'basic' | 'pro';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  stats?: {
    usersCount: number;
    instancesCount: number;
    projectsCount: number;
  };
}

export interface OrganizationMemberResponse {
  id: string;
  userId: string;
  organizationId: string;
  role: 'master' | 'manager' | 'user';
  isActive: boolean;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
    isActive: boolean;
  };
}

export interface PaginatedOrganizationsResponse {
  data: OrganizationResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
