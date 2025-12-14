/**
 * Chatwoot Webhook Normalizer
 * 
 * @description Normalizes incoming Chatwoot webhooks into a standardized format.
 * Based on N8N integration patterns provided by the user.
 * 
 * Key features:
 * - Detects and ignores bot echo messages using invisible Unicode marker
 * - Normalizes contact phone numbers
 * - Extracts message direction (IN/OUT) and author type
 * - Handles attachments
 * 
 * @version 1.0.0
 */

import {
  BOT_SIGNATURE,
  type ChatwootWebhookPayload,
  type ChatwootWebhookEvent,
  type NormalizedChatwootEvent,
  type NormalizedChatwootContact,
  type NormalizedChatwootMessage,
  type MessageDirection,
  type MessageAuthor,
  type ChatwootAttachment,
} from '../chatwoot.interfaces';

// Bot signature constant (re-imported for clarity)
const BOT_MARKER = '\u200B\u200C\u200D';

// ============================================
// Helper Functions
// ============================================

/**
 * Normalize phone number (remove non-digits)
 */
function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Determine message direction and author from Chatwoot payload
 */
function getMessageDirectionAndAuthor(
  messageType: number | undefined,
  sender?: { type?: 'user' | 'agent_bot' | 'contact' }
): { direction: MessageDirection; author: MessageAuthor } {
  // message_type: 0=incoming, 1=outgoing, 2=activity, 3=template
  
  if (messageType === 0) {
    // Incoming message from customer
    return {
      direction: 'IN',
      author: 'CUSTOMER',
    };
  } else if (messageType === 1) {
    // Outgoing message from agent or bot
    if (sender?.type === 'agent_bot') {
      return {
        direction: 'OUT',
        author: 'AI',
      };
    }
    return {
      direction: 'OUT',
      author: 'HUMAN',
    };
  } else if (messageType === 2) {
    // Activity message (system)
    return {
      direction: 'OUT',
      author: 'SYSTEM',
    };
  }

  // Default: assume incoming from customer
  return {
    direction: 'IN',
    author: 'CUSTOMER',
  };
}

/**
 * Detect message type from content and attachments
 */
function detectMessageType(
  content?: string | null,
  attachments?: ChatwootAttachment[]
): 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contact' {
  // Business Rule: If has attachments, use first attachment type
  if (attachments && attachments.length > 0) {
    const firstAttachment = attachments[0];
    const fileType = firstAttachment.file_type?.toLowerCase();
    
    if (fileType === 'image' || firstAttachment.data_url?.includes('image')) {
      return 'image';
    }
    if (fileType === 'audio' || firstAttachment.data_url?.includes('audio')) {
      return 'audio';
    }
    if (fileType === 'video' || firstAttachment.data_url?.includes('video')) {
      return 'video';
    }
    if (fileType === 'location') {
      return 'location';
    }
    if (fileType === 'contact') {
      return 'contact';
    }
    return 'document';
  }

  // Default to text
  return 'text';
}

/**
 * Extract message content from payload
 */
function extractMessageContent(content?: string | null): string {
  if (content === null || content === undefined) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (typeof content === 'object' && (content as any).text) {
    return (content as any).text;
  }
  return '';
}

/**
 * Extract contact information from conversation
 */
function extractContact(payload: ChatwootWebhookPayload): NormalizedChatwootContact {
  // Business Rule: Contact data can be in multiple places
  const sender = payload.conversation?.meta?.sender;
  const contact = payload.contact || sender;
  
  const phoneNumber = normalizePhone(
    contact?.phone_number || contact?.identifier || ''
  );
  
  const name = contact?.name || 
    contact?.identifier || 
    phoneNumber || 
    'Unknown';

  return {
    id: contact?.id,
    phoneNumber,
    name,
    identifier: contact?.identifier || undefined,
    thumbnailUrl: contact?.thumbnail || undefined,
  };
}

// ============================================
// Main Normalizer Function
// ============================================

/**
 * @function normalizeChatwootWebhook
 * @description Normalizes a raw Chatwoot webhook payload into a standardized format.
 * 
 * @param payload - Raw webhook payload from Chatwoot
 * @returns Normalized event data
 * 
 * @example
 * const normalized = normalizeChatwootWebhook(webhookPayload);
 * if (normalized.ignore) {
 *   console.log('Ignoring:', normalized.ignoreReason);
 *   return;
 * }
 * // Process normalized.message, normalized.contact, etc.
 */
export function normalizeChatwootWebhook(
  payload: ChatwootWebhookPayload
): NormalizedChatwootEvent {
  const event = payload.event;

  console.log('[ChatwootNormalizer] Processing event:', event);

  // =========================================================================
  // STEP 1: Bot Echo Detection (Invisible Unicode Marker)
  // =========================================================================
  const messageContent = payload.content || '';
  const isBotEcho = messageContent.startsWith(BOT_MARKER);

  if (isBotEcho) {
    console.log('[ChatwootNormalizer] Bot echo detected - ignoring');
    return {
      ignore: true,
      ignoreReason: 'bot_echo_marker',
      event,
      direction: 'OUT',
      author: 'AI',
      contact: {
        phoneNumber: '',
        name: '',
      },
      message: {
        content: messageContent.substring(BOT_MARKER.length), // Remove marker
        type: 'text',
      },
      chatwoot: {
        messageId: payload.id,
      },
      raw: payload,
    };
  }

  // =========================================================================
  // STEP 2: Handle Non-Message Events
  // =========================================================================
  if (event !== 'message_created' && event !== 'message_updated') {
    console.log('[ChatwootNormalizer] Non-message event:', event);
    
    // For conversation/contact events, still extract basic info
    const contact = extractContact(payload);
    
    return {
      ignore: true,
      ignoreReason: `non_message_event:${event}`,
      event,
      direction: 'IN',
      author: 'SYSTEM',
      contact,
      message: {
        content: '',
        type: 'text',
      },
      chatwoot: {
        accountId: payload.account?.id,
        inboxId: payload.inbox?.id,
        conversationId: payload.conversation?.id,
        contactId: payload.contact?.id,
      },
      raw: payload,
    };
  }

  // =========================================================================
  // STEP 3: Validate Required Data
  // =========================================================================
  if (!payload.content && (!payload.attachments || payload.attachments.length === 0)) {
    console.log('[ChatwootNormalizer] Empty message - ignoring');
    return {
      ignore: true,
      ignoreReason: 'empty_message',
      event,
      direction: 'IN',
      author: 'CUSTOMER',
      contact: extractContact(payload),
      message: {
        content: '',
        type: 'text',
      },
      chatwoot: {
        accountId: payload.account?.id,
        inboxId: payload.inbox?.id,
        conversationId: payload.conversation?.id,
        messageId: payload.id,
      },
      raw: payload,
    };
  }

  // =========================================================================
  // STEP 4: Extract Contact Information
  // =========================================================================
  const contact = extractContact(payload);

  if (!contact.phoneNumber) {
    console.log('[ChatwootNormalizer] No phone number found');
    // Still process but mark as potentially invalid
  }

  // =========================================================================
  // STEP 5: Determine Direction and Author
  // =========================================================================
  const { direction, author } = getMessageDirectionAndAuthor(
    payload.message_type,
    payload.sender as any
  );

  // =========================================================================
  // STEP 6: Extract Message Data
  // =========================================================================
  const messageType = detectMessageType(payload.content, payload.attachments);
  const content = extractMessageContent(payload.content);

  const message: NormalizedChatwootMessage = {
    content,
    type: messageType,
    attachments: payload.attachments,
    sourceId: payload.source_id || undefined,
  };

  // =========================================================================
  // STEP 7: Extract Agent Info (if outgoing)
  // =========================================================================
  let agent;
  if (direction === 'OUT' && payload.sender) {
    agent = {
      id: payload.sender.id,
      name: payload.sender.name || 'Agent',
      type: payload.sender.type as 'user' | 'agent_bot',
    };
  }

  // =========================================================================
  // STEP 8: Build Normalized Event
  // =========================================================================
  const normalized: NormalizedChatwootEvent = {
    event,
    direction,
    author,
    contact,
    message,
    agent,
    chatwoot: {
      accountId: payload.account?.id,
      inboxId: payload.inbox?.id,
      conversationId: payload.conversation?.id,
      messageId: payload.id,
      contactId: payload.contact?.id || payload.conversation?.meta?.sender?.id,
    },
    raw: payload,
  };

  console.log('[ChatwootNormalizer] Normalized event:', {
    event,
    direction,
    author,
    contact: contact.name,
    messageType,
    contentPreview: content.substring(0, 50),
  });

  return normalized;
}

// ============================================
// Additional Utilities
// ============================================

/**
 * Check if the webhook should trigger a WhatsApp message
 * @param normalized Normalized event
 * @returns true if should send to WhatsApp
 */
export function shouldSendToWhatsApp(normalized: NormalizedChatwootEvent): boolean {
  // Business Rule: Only send outgoing messages from human agents
  if (normalized.ignore) return false;
  if (normalized.direction !== 'OUT') return false;
  if (normalized.author !== 'HUMAN') return false;
  if (!normalized.contact.phoneNumber) return false;
  
  return true;
}

/**
 * Check if the webhook should sync contact to Chatwoot
 */
export function shouldSyncContact(normalized: NormalizedChatwootEvent): boolean {
  // Business Rule: Sync incoming messages from customers
  if (normalized.ignore) return false;
  if (normalized.direction !== 'IN') return false;
  if (!normalized.contact.phoneNumber) return false;
  
  return true;
}

/**
 * Remove bot signature from message content
 */
export function removeBotSignature(content: string): string {
  if (content.startsWith(BOT_MARKER)) {
    return content.substring(BOT_MARKER.length);
  }
  return content;
}

/**
 * Add bot signature to message content
 */
export function addBotSignature(content: string): string {
  return `${BOT_MARKER}${content}`;
}
