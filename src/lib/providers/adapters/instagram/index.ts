/**
 * @module Instagram Provider
 * @description Instagram Messaging (Meta Graph API) adapter exports
 */

// Adapter
export { InstagramAdapter } from './instagram.adapter';

// Client
export { InstagramClient } from './instagram.client';

// Normalizer
export {
  normalizeInstagramWebhook,
  verifyWebhookSignature,
  handleVerificationChallenge,
} from './instagram.normalizer';

// Types
export type {
  InstagramClientConfig,
  InstagramMessageResponse,
  InstagramSendMessagePayload,
  InstagramWebhookPayload,
  InstagramWebhookEntry,
  InstagramMessagingEvent,
  InstagramIncomingMessage,
  InstagramAttachment,
  InstagramErrorResponse,
} from './instagram.types';
