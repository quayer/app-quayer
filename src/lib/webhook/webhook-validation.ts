/**
 * Webhook Payload Validation Schemas
 *
 * Validates the structure of incoming webhook payloads from different providers
 * to ensure data integrity and prevent processing of malformed payloads.
 */

import { z } from 'zod';

/**
 * Media object schema for webhook payloads
 * Includes all WhatsApp media types: audio, voice, ptt (push-to-talk), video, image, document, sticker
 */
const mediaSchema = z.object({
  type: z.enum(['audio', 'voice', 'ptt', 'video', 'image', 'document', 'sticker']).optional(),
  mediaUrl: z.string().optional(),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
  duration: z.number().optional(),
  size: z.number().optional(),
  needsDownload: z.boolean().optional(),
}).passthrough();

/**
 * Message object schema for webhook payloads
 */
const messageSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  content: z.string().optional(),
  media: mediaSchema.optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  locationName: z.string().optional(),
  author: z.string().optional(),
}).passthrough();

/**
 * Data object schema for webhook payloads
 */
const webhookDataSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  message: messageSchema.optional(),
  contactName: z.string().optional(),
  pushName: z.string().optional(),
  participant: z.string().optional(),
  sender: z.string().optional(),
  author: z.string().optional(),
  status: z.string().optional(),
  qrCode: z.string().optional(),
  groupName: z.string().optional(),
  subject: z.string().optional(),
}).passthrough();

/**
 * Main webhook payload schema
 * Uses passthrough() to allow extra fields while validating the core structure
 */
export const webhookPayloadSchema = z.object({
  event: z.string().optional(),
  instanceId: z.string().optional(),
  data: webhookDataSchema.optional(),
}).passthrough();

/**
 * UAZapi-specific webhook schema
 */
export const uazapiWebhookSchema = z.object({
  event: z.string().optional(),
  instanceId: z.string().optional(),
  token: z.string().optional(),
  data: webhookDataSchema.optional(),
}).passthrough();

/**
 * Evolution-specific webhook schema
 */
export const evolutionWebhookSchema = z.object({
  event: z.string().optional(),
  instance: z.object({
    instanceId: z.string().optional(),
    instanceName: z.string().optional(),
  }).passthrough().optional(),
  data: webhookDataSchema.optional(),
}).passthrough();

/**
 * Cloud API (Meta) webhook schema
 */
export const cloudApiWebhookSchema = z.object({
  object: z.string().optional(),
  entry: z.array(z.object({
    id: z.string().optional(),
    changes: z.array(z.object({
      value: z.object({
        messaging_product: z.string().optional(),
        metadata: z.object({
          display_phone_number: z.string().optional(),
          phone_number_id: z.string().optional(),
        }).passthrough().optional(),
        messages: z.array(z.any()).optional(),
        statuses: z.array(z.any()).optional(),
      }).passthrough().optional(),
      field: z.string().optional(),
    }).passthrough()).optional(),
  }).passthrough()).optional(),
}).passthrough();

/**
 * Validate webhook payload based on provider type
 */
export function validateWebhookPayload(
  provider: string,
  payload: unknown
): { success: true; data: z.infer<typeof webhookPayloadSchema> } | { success: false; errors: z.ZodError['issues'] } {
  let schema: z.ZodSchema;

  switch (provider) {
    case 'uazapi':
      schema = uazapiWebhookSchema;
      break;
    case 'evolution':
      schema = evolutionWebhookSchema;
      break;
    case 'cloudapi':
      schema = cloudApiWebhookSchema;
      break;
    default:
      schema = webhookPayloadSchema;
  }

  const result = schema.safeParse(payload);

  if (result.success) {
    return { success: true, data: result.data as z.infer<typeof webhookPayloadSchema> };
  }

  return { success: false, errors: result.error.issues };
}

export type WebhookPayloadType = z.infer<typeof webhookPayloadSchema>;
