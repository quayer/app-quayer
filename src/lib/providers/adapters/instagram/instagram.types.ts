/**
 * @module Instagram Types
 * @description Type definitions for Instagram Messaging via Meta Graph API
 * @see https://developers.facebook.com/docs/messenger-platform/instagram
 *
 * Instagram DMs are delivered through the Messenger Platform on top of the
 * Graph API. Outbound messages POST to `/me/messages` using the Page Access
 * Token tied to the Instagram-linked Facebook Page. Inbound events arrive via
 * the same webhook shape used by Messenger (`object: 'instagram'`).
 */

// ===== CLIENT CONFIG =====

/**
 * Configuration for InstagramClient initialization
 */
export interface InstagramClientConfig {
  /** Instagram Business Account ID (informational / scoping). */
  igAccountId: string;
  /** Page Access Token used as Bearer for Graph API calls — SECRET. */
  pageAccessToken: string;
  /** App Secret used to validate webhook X-Hub signatures — SECRET. */
  appSecret: string;
  /** Verify token for the webhook GET challenge — SECRET. */
  verifyToken: string;
  /** Graph API version (default: v20.0). */
  apiVersion?: string;
  /** Request timeout in milliseconds (default: 30000). */
  timeout?: number;
}

// ===== MESSAGE RESPONSES =====

/**
 * Response from sending a message via `/me/messages`
 */
export interface InstagramMessageResponse {
  /** Instagram-scoped recipient id (IGSID). */
  recipient_id: string;
  /** Message id assigned by the platform. */
  message_id: string;
}

// ===== SEND MESSAGE PAYLOAD =====

/**
 * Payload for sending a message via the Messenger send API (`/me/messages`)
 */
export interface InstagramSendMessagePayload {
  /** Instagram-scoped recipient id (IGSID). */
  recipient: {
    id: string;
  };
  /** Message body. Text only for the base adapter. */
  message: {
    text?: string;
    attachment?: {
      type: 'image' | 'video' | 'audio' | 'file';
      payload: {
        url?: string;
        is_reusable?: boolean;
      };
    };
  };
  /** RESPONSE | UPDATE | MESSAGE_TAG (default RESPONSE). */
  messaging_type?: 'RESPONSE' | 'UPDATE' | 'MESSAGE_TAG';
}

// ===== WEBHOOK PAYLOADS =====

/**
 * Root webhook payload from Instagram Messaging
 */
export interface InstagramWebhookPayload {
  object: 'instagram';
  entry: Array<InstagramWebhookEntry>;
}

/**
 * Webhook entry containing messaging events
 */
export interface InstagramWebhookEntry {
  /** Instagram account id receiving the event. */
  id: string;
  /** Unix epoch (ms). */
  time: number;
  messaging?: Array<InstagramMessagingEvent>;
}

/**
 * A single messaging event (incoming message or echo)
 */
export interface InstagramMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  /** Unix epoch (ms). */
  timestamp: number;
  message?: InstagramIncomingMessage;
}

/**
 * Incoming message body from a webhook event
 */
export interface InstagramIncomingMessage {
  mid: string;
  text?: string;
  /** Set when the message is an echo of something the bot sent. */
  is_echo?: boolean;
  attachments?: Array<InstagramAttachment>;
}

/**
 * Attachment object on an incoming message
 */
export interface InstagramAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'share' | 'story_mention';
  payload: {
    url?: string;
  };
}

// ===== ERROR HANDLING =====

/**
 * Graph API error response
 */
export interface InstagramErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}
