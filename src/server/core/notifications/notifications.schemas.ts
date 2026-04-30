/**
 * Notifications Schemas
 *
 * Zod schemas for notification validation
 */

import { z } from 'zod'

// Notification types
export const NOTIFICATION_TYPES = [
  'MESSAGE',
  'USER',
  'WARNING',
  'INFO',
  'SUCCESS',
  'ERROR',
  'SYSTEM',
  'CONNECTION',
] as const

export type NotificationType = typeof NOTIFICATION_TYPES[number]

// Create notification schema
export const createNotificationSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().min(1, 'Titulo e obrigatorio').max(200, 'Titulo muito longo'),
  description: z.string().min(1, 'Descricao e obrigatoria'),
  actionUrl: z.string().url().optional().nullable(),
  actionLabel: z.string().max(50).optional().nullable(),
  source: z.string().max(50).optional().nullable(),
  sourceId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.any()).optional().nullable(),
  // Target options (at least one required)
  userId: z.string().uuid().optional().nullable(),
  organizationId: z.string().uuid().optional().nullable(),
  role: z.string().optional().nullable(),
  isGlobal: z.boolean().default(false),
  // Scheduling
  scheduledFor: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
})

// Update notification schema
export const updateNotificationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  actionUrl: z.string().url().optional().nullable(),
  actionLabel: z.string().max(50).optional().nullable(),
  isActive: z.boolean().optional(),
  scheduledFor: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
})

// List notifications query params
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  source: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  isGlobal: z.coerce.boolean().optional(),
  unreadOnly: z.coerce.boolean().optional(),
})

// Notification response schema
export const notificationResponseSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  description: z.string(),
  actionUrl: z.string().nullable(),
  actionLabel: z.string().nullable(),
  source: z.string().nullable(),
  sourceId: z.string().nullable(),
  metadata: z.record(z.any()).nullable(),
  userId: z.string().nullable(),
  organizationId: z.string().nullable(),
  role: z.string().nullable(),
  isGlobal: z.boolean(),
  isActive: z.boolean(),
  scheduledFor: z.date().nullable(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  read: z.boolean().optional(), // For user-specific queries
})

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>
export type UpdateNotificationInput = z.infer<typeof updateNotificationSchema>
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>
export type NotificationResponse = z.infer<typeof notificationResponseSchema>
