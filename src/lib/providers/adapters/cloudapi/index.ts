/**
 * @module CloudAPI Provider
 * @description WhatsApp Cloud API (Official Meta API) adapter exports
 */

// Adapter
export { CloudAPIAdapter } from './cloudapi.adapter';

// Client
export { CloudAPIClient } from './cloudapi.client';

// Normalizer
export {
  normalizeCloudAPIWebhook,
  verifyWebhookSignature,
  handleVerificationChallenge,
} from './cloudapi.normalizer';

// Types
export type {
  CloudAPIClientConfig,
  CloudAPIMessageResponse,
  CloudAPIPhoneInfo,
  CloudAPIWebhookPayload,
  CloudAPIWebhookEntry,
  CloudAPIWebhookValue,
  CloudAPIIncomingMessage,
  CloudAPIMessageType,
  CloudAPIMediaObject,
  CloudAPIMessageStatus,
  CloudAPIError,
  CloudAPISendMessageBase,
  CloudAPISendTextPayload,
  CloudAPISendImagePayload,
  CloudAPISendVideoPayload,
  CloudAPISendAudioPayload,
  CloudAPISendDocumentPayload,
  CloudAPISendTemplatePayload,
  CloudAPISendLocationPayload,
  CloudAPIMediaUploadResponse,
  CloudAPIMediaUrlResponse,
  CloudAPIErrorResponse,
} from './cloudapi.types';
