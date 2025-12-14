/**
 * @module CloudAPI Types
 * @description Type definitions for WhatsApp Cloud API (Official Meta API)
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api
 */

// ===== CLIENT CONFIG =====

/**
 * Configuration for CloudAPI client initialization
 */
export interface CloudAPIClientConfig {
  /** System User Access Token from Meta Business */
  accessToken: string;
  /** Phone Number ID from WhatsApp Business Manager */
  phoneNumberId: string;
  /** WhatsApp Business Account ID */
  wabaId: string;
  /** Graph API version (default: v20.0) */
  apiVersion?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

// ===== MESSAGE RESPONSES =====

/**
 * Response from sending a message via Cloud API
 */
export interface CloudAPIMessageResponse {
  messaging_product: 'whatsapp';
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

/**
 * Phone info response from Cloud API
 */
export interface CloudAPIPhoneInfo {
  verified_name: string;
  display_phone_number: string;
  id: string;
  quality_rating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  code_verification_status?: string;
  platform_type?: string;
  throughput?: {
    level: string;
  };
}

// ===== WEBHOOK PAYLOADS =====

/**
 * Root webhook payload from Cloud API
 */
export interface CloudAPIWebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<CloudAPIWebhookEntry>;
}

/**
 * Webhook entry containing changes
 */
export interface CloudAPIWebhookEntry {
  id: string;
  changes: Array<{
    value: CloudAPIWebhookValue;
    field: 'messages';
  }>;
}

/**
 * Webhook value with message or status data
 */
export interface CloudAPIWebhookValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{
    profile: {
      name: string;
    };
    wa_id: string;
  }>;
  messages?: Array<CloudAPIIncomingMessage>;
  statuses?: Array<CloudAPIMessageStatus>;
  errors?: Array<CloudAPIError>;
}

/**
 * Incoming message from Cloud API webhook
 */
export interface CloudAPIIncomingMessage {
  id: string;
  from: string;
  timestamp: string;
  type: CloudAPIMessageType;
  // Message content by type
  text?: {
    body: string;
  };
  image?: CloudAPIMediaObject;
  video?: CloudAPIMediaObject;
  audio?: CloudAPIMediaObject;
  document?: CloudAPIMediaObject & {
    filename: string;
  };
  sticker?: CloudAPIMediaObject;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  contacts?: Array<{
    name: {
      formatted_name: string;
      first_name?: string;
      last_name?: string;
    };
    phones?: Array<{
      phone: string;
      type: string;
      wa_id?: string;
    }>;
  }>;
  button?: {
    text: string;
    payload: string;
  };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
  context?: {
    from: string;
    id: string;
  };
}

export type CloudAPIMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'button'
  | 'interactive'
  | 'reaction'
  | 'unsupported';

/**
 * Media object from Cloud API
 */
export interface CloudAPIMediaObject {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
}

/**
 * Message status update from Cloud API
 */
export interface CloudAPIMessageStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin: {
      type: 'business_initiated' | 'user_initiated' | 'referral_conversion';
    };
    expiration_timestamp?: string;
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: Array<CloudAPIError>;
}

/**
 * Error from Cloud API
 */
export interface CloudAPIError {
  code: number;
  title: string;
  message?: string;
  error_data?: {
    details: string;
  };
  href?: string;
}

// ===== SEND MESSAGE PAYLOADS =====

/**
 * Base payload for sending messages
 */
export interface CloudAPISendMessageBase {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
}

/**
 * Payload for sending text messages
 */
export interface CloudAPISendTextPayload extends CloudAPISendMessageBase {
  type: 'text';
  text: {
    preview_url?: boolean;
    body: string;
  };
}

/**
 * Payload for sending image messages
 */
export interface CloudAPISendImagePayload extends CloudAPISendMessageBase {
  type: 'image';
  image: {
    id?: string;
    link?: string;
    caption?: string;
  };
}

/**
 * Payload for sending video messages
 */
export interface CloudAPISendVideoPayload extends CloudAPISendMessageBase {
  type: 'video';
  video: {
    id?: string;
    link?: string;
    caption?: string;
  };
}

/**
 * Payload for sending audio messages
 */
export interface CloudAPISendAudioPayload extends CloudAPISendMessageBase {
  type: 'audio';
  audio: {
    id?: string;
    link?: string;
  };
}

/**
 * Payload for sending document messages
 */
export interface CloudAPISendDocumentPayload extends CloudAPISendMessageBase {
  type: 'document';
  document: {
    id?: string;
    link?: string;
    filename?: string;
    caption?: string;
  };
}

/**
 * Payload for sending template messages
 */
export interface CloudAPISendTemplatePayload extends CloudAPISendMessageBase {
  type: 'template';
  template: {
    name: string;
    language: {
      code: string;
    };
    components?: Array<{
      type: 'header' | 'body' | 'button';
      parameters?: Array<{
        type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
        text?: string;
        currency?: {
          fallback_value: string;
          code: string;
          amount_1000: number;
        };
        date_time?: {
          fallback_value: string;
        };
        image?: {
          link: string;
        };
        document?: {
          link: string;
        };
        video?: {
          link: string;
        };
      }>;
      sub_type?: 'quick_reply' | 'url';
      index?: number;
    }>;
  };
}

/**
 * Payload for sending location messages
 */
export interface CloudAPISendLocationPayload extends CloudAPISendMessageBase {
  type: 'location';
  location: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}

// ===== MEDIA HANDLING =====

/**
 * Response from media upload
 */
export interface CloudAPIMediaUploadResponse {
  id: string;
}

/**
 * Response from media URL retrieval
 */
export interface CloudAPIMediaUrlResponse {
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
  messaging_product: 'whatsapp';
}

// ===== ERROR HANDLING =====

/**
 * Graph API error response
 */
export interface CloudAPIErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id: string;
  };
}
