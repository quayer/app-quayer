/**
 * Webhooks Repository
 * Data access layer for Webhook and WebhookDelivery entities
 */

import { database } from '@/services/database';
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
  ListWebhooksQuery,
  ListDeliveriesQuery,
  WebhookWithRelations,
  WebhookDeliveryWithWebhook,
  WebhookPayload,
} from './webhooks.interfaces';
import type { Prisma } from '@prisma/client';

export class WebhooksRepository {
  // ============================================
  // WEBHOOK CRUD
  // ============================================

  async create(data: CreateWebhookInput): Promise<WebhookWithRelations> {
    return database.webhook.create({
      data,
      include: {
        _count: {
          select: {
            deliveries: true,
          },
        },
      },
    });
  }

  async findById(id: string, includeRelations = false): Promise<WebhookWithRelations | null> {
    return database.webhook.findUnique({
      where: { id },
      include: includeRelations
        ? {
            _count: {
              select: {
                deliveries: true,
              },
            },
          }
        : undefined,
    });
  }

  async list(query: ListWebhooksQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.WebhookWhereInput = {
      ...(query.organizationId && { organizationId: query.organizationId }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    };

    const [data, total] = await Promise.all([
      database.webhook.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              deliveries: true,
            },
          },
        },
      }),
      database.webhook.count({ where }),
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

  async update(id: string, data: UpdateWebhookInput): Promise<WebhookWithRelations> {
    return database.webhook.update({
      where: { id },
      data,
      include: {
        _count: {
          select: {
            deliveries: true,
          },
        },
      },
    });
  }

  async softDelete(id: string): Promise<WebhookWithRelations> {
    return database.webhook.update({
      where: { id },
      data: { isActive: false },
      include: {
        _count: {
          select: {
            deliveries: true,
          },
        },
      },
    });
  }

  async hardDelete(id: string): Promise<void> {
    await database.webhook.delete({
      where: { id },
    });
  }

  // ============================================
  // WEBHOOK DELIVERIES
  // ============================================

  async createDelivery(
    webhookId: string,
    event: string,
    payload: any
  ): Promise<WebhookDeliveryWithWebhook> {
    return database.webhookDelivery.create({
      data: {
        webhookId,
        event,
        payload,
        status: 'pending',
        attempts: 0,
      },
      include: {
        webhook: true,
      },
    });
  }

  async updateDelivery(
    id: string,
    data: {
      status?: 'success' | 'failure' | 'pending';
      response?: any;
      attempts?: number;
      completedAt?: Date;
    }
  ): Promise<WebhookDeliveryWithWebhook> {
    return database.webhookDelivery.update({
      where: { id },
      data,
      include: {
        webhook: true,
      },
    });
  }

  async listDeliveries(query: ListDeliveriesQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.WebhookDeliveryWhereInput = {
      ...(query.webhookId && { webhookId: query.webhookId }),
      ...(query.status && { status: query.status }),
    };

    const [data, total] = await Promise.all([
      database.webhookDelivery.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          webhook: true,
        },
      }),
      database.webhookDelivery.count({ where }),
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

  async getDeliveryById(id: string): Promise<WebhookDeliveryWithWebhook | null> {
    return database.webhookDelivery.findUnique({
      where: { id },
      include: {
        webhook: true,
      },
    });
  }

  // ============================================
  // HELPERS
  // ============================================

  async findActiveWebhooksByOrg(organizationId: string): Promise<WebhookWithRelations[]> {
    return database.webhook.findMany({
      where: {
        organizationId,
        isActive: true,
      },
    });
  }

  async findWebhooksByEvent(event: string, organizationId: string): Promise<WebhookWithRelations[]> {
    return database.webhook.findMany({
      where: {
        organizationId,
        isActive: true,
        events: {
          has: event,
        },
      },
    });
  }

  async getSuccessRate(webhookId: string): Promise<number> {
    const [total, successful] = await Promise.all([
      database.webhookDelivery.count({
        where: { webhookId },
      }),
      database.webhookDelivery.count({
        where: {
          webhookId,
          status: 'success',
        },
      }),
    ]);

    return total > 0 ? (successful / total) * 100 : 0;
  }
}

// Export singleton instance
export const webhooksRepository = new WebhooksRepository();
