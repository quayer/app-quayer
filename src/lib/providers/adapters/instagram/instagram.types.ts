/**
 * @module Instagram Types
 * @description Type definitions for Instagram Messaging API (Meta Graph API)
 */

export interface InstagramClientConfig {
  accessToken: string;
  instagramAccountId: string;
  pageId: string;
  apiVersion?: string;
  timeout?: number;
}

export interface InstagramMessageResponse {
  recipient_id: string;
  message_id: string;
}

export interface InstagramWebhookPayload {
  object: 'instagram';
  entry: Array<{
    id: string;
    time: number;
    messaging: Array<InstagramWebhookMessaging>;
  }>;
}

export interface InstagramWebhookMessaging {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{
      type: 'image' | 'video' | 'audio' | 'file' | 'share' | 'story_mention' | 'reel';
      payload: {
        url?: string;
        title?: string;
        sticker_id?: number;
      };
    }>;
    quick_reply?: {
      payload: string;
    };
    reply_to?: {
      mid: string;
    };
    is_echo?: boolean;
    is_deleted?: boolean;
  };
  postback?: {
    mid: string;
    title: string;
    payload: string;
  };
  reaction?: {
    mid: string;
    action: 'react' | 'unreact';
    emoji?: string;
  };
  read?: {
    watermark: number;
  };
}
