/**
 * Chatwoot HTTP Client
 * 
 * @description HTTP client for interacting with Chatwoot API.
 * Handles contacts, conversations, and messages.
 * 
 * @see https://www.chatwoot.com/developers/api/
 * @version 1.0.0
 */

import type {
  ChatwootConfig,
  ChatwootContact,
  ChatwootConversation,
  ChatwootMessage,
  ChatwootInbox,
  ChatwootAccount,
  CreateChatwootContactInput,
  CreateChatwootConversationInput,
  SendChatwootMessageInput,
  ChatwootAttachment,
  CHATWOOT_API_VERSION,
  BOT_SIGNATURE,
} from '../chatwoot.interfaces';

// Re-import constants since they're not types
const API_VERSION = 'v1';
const BOT_MARKER = '\u200B\u200C\u200D';

/**
 * @interface ChatwootClientConfig
 * @description Configuration for ChatwootClient
 */
export interface ChatwootClientConfig {
  url: string;
  accessToken: string;
  accountId: number;
  inboxId?: number;
}

/**
 * @interface ChatwootApiError
 * @description Structure of Chatwoot API error responses
 */
export interface ChatwootApiError {
  error?: string;
  message?: string;
  errors?: Array<{ field: string; message: string }>;
}

/**
 * @class ChatwootClient
 * @description HTTP client for Chatwoot API operations
 */
export class ChatwootClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly accountId: number;
  private readonly inboxId?: number;

  constructor(config: ChatwootClientConfig) {
    // Business Rule: Normalize URL (remove trailing slash)
    this.baseUrl = config.url.replace(/\/$/, '');
    this.accessToken = config.accessToken;
    this.accountId = config.accountId;
    this.inboxId = config.inboxId;
  }

  /**
   * Create client from ChatwootConfig
   */
  static fromConfig(config: ChatwootConfig): ChatwootClient {
    return new ChatwootClient({
      url: config.url,
      accessToken: config.accessToken,
      accountId: config.accountId,
      inboxId: config.inboxId,
    });
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Build API URL for a given endpoint
   */
  private buildUrl(endpoint: string): string {
    // Business Rule: All endpoints are under /api/v1/accounts/{accountId}
    return `${this.baseUrl}/api/${API_VERSION}/accounts/${this.accountId}${endpoint}`;
  }

  /**
   * Make HTTP request to Chatwoot API
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: any,
    options?: { timeout?: number }
  ): Promise<T> {
    const url = this.buildUrl(endpoint);
    const timeout = options?.timeout || 30000;

    console.log(`[ChatwootClient] ${method} ${url}`);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'api_access_token': this.accessToken,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout),
      });

      const responseText = await response.text();
      
      // Business Rule: Log response for debugging
      console.log(`[ChatwootClient] Response ${response.status}: ${responseText.substring(0, 500)}`);

      if (!response.ok) {
        let errorData: ChatwootApiError = {};
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { message: responseText };
        }

        const errorMessage = errorData.message || errorData.error || `HTTP ${response.status}`;
        throw new Error(`Chatwoot API Error: ${errorMessage}`);
      }

      // Business Rule: Return parsed JSON or empty object for 204
      if (response.status === 204 || !responseText) {
        return {} as T;
      }

      return JSON.parse(responseText) as T;
    } catch (error: any) {
      console.error(`[ChatwootClient] Error: ${error.message}`);
      throw error;
    }
  }

  // ============================================
  // Health Check
  // ============================================

  /**
   * Test connection to Chatwoot API
   * @returns Connection status and account info
   */
  async testConnection(): Promise<{ success: boolean; account?: ChatwootAccount; error?: string }> {
    try {
      // Business Rule: Use profile endpoint to validate token
      const profile = await this.request<{ id: number; name: string }>('GET', '/profile');
      
      // Also get account info
      const account = await this.getAccount();
      
      console.log(`[ChatwootClient] Connection test successful - Account: ${account.name}`);
      
      return {
        success: true,
        account,
      };
    } catch (error: any) {
      console.error(`[ChatwootClient] Connection test failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get account information
   */
  async getAccount(): Promise<ChatwootAccount> {
    // Business Rule: Account endpoint doesn't have /accounts prefix
    const url = `${this.baseUrl}/api/${API_VERSION}/accounts/${this.accountId}`;
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': this.accessToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get account: HTTP ${response.status}`);
    }

    return response.json();
  }

  // ============================================
  // Contacts
  // ============================================

  /**
   * Search contacts by phone number or identifier
   */
  async searchContacts(query: string): Promise<ChatwootContact[]> {
    // Business Rule: Use contact search endpoint
    const result = await this.request<{ payload: ChatwootContact[] }>(
      'GET',
      `/contacts/search?q=${encodeURIComponent(query)}`
    );
    return result.payload || [];
  }

  /**
   * Find contact by phone number
   */
  async findContactByPhone(phoneNumber: string): Promise<ChatwootContact | null> {
    try {
      // Observation: Normalize phone number (remove + and spaces)
      const normalizedPhone = phoneNumber.replace(/[^\d]/g, '');
      
      // Business Rule: Search by phone number
      const contacts = await this.searchContacts(normalizedPhone);
      
      // Business Rule: Find exact match
      const contact = contacts.find(c => {
        const contactPhone = (c.phone_number || c.identifier || '').replace(/[^\d]/g, '');
        return contactPhone === normalizedPhone || contactPhone.endsWith(normalizedPhone);
      });

      return contact || null;
    } catch (error) {
      console.error('[ChatwootClient] Error finding contact:', error);
      return null;
    }
  }

  /**
   * Get contact by ID
   */
  async getContact(contactId: number): Promise<ChatwootContact> {
    return this.request<ChatwootContact>('GET', `/contacts/${contactId}`);
  }

  /**
   * Create a new contact
   */
  async createContact(data: CreateChatwootContactInput): Promise<ChatwootContact> {
    // Business Rule: Create contact with inbox assignment
    const payload = {
      ...data,
      inbox_id: this.inboxId,
    };

    return this.request<ChatwootContact>('POST', '/contacts', payload);
  }

  /**
   * Update contact
   */
  async updateContact(contactId: number, data: Partial<CreateChatwootContactInput>): Promise<ChatwootContact> {
    return this.request<ChatwootContact>('PUT', `/contacts/${contactId}`, data);
  }

  /**
   * Update contact name with intelligent name handling
   * @param contactId Chatwoot contact ID
   * @param name New name (use ~ prefix for auto-update names)
   */
  async updateContactName(contactId: number, name: string): Promise<ChatwootContact> {
    // Business Rule: Names starting with ~ are auto-updated
    return this.updateContact(contactId, { name });
  }

  /**
   * Find or create contact by phone number
   */
  async findOrCreateContact(phoneNumber: string, name?: string): Promise<ChatwootContact> {
    // Observation: Try to find existing contact
    const existing = await this.findContactByPhone(phoneNumber);
    
    if (existing) {
      // Business Rule: Update name if provided and different (and using ~ prefix)
      if (name && existing.name !== name && existing.name?.startsWith('~')) {
        console.log(`[ChatwootClient] Updating contact name: ${existing.name} -> ~${name}`);
        return this.updateContactName(existing.id, `~${name}`);
      }
      return existing;
    }

    // Business Rule: Create new contact with ~ prefix for auto-update
    console.log(`[ChatwootClient] Creating new contact: ${phoneNumber}`);
    return this.createContact({
      name: `~${name || phoneNumber}`,
      phone_number: `+${phoneNumber.replace(/[^\d]/g, '')}`,
      identifier: phoneNumber,
    });
  }

  // ============================================
  // Conversations
  // ============================================

  /**
   * List conversations for a contact
   */
  async listContactConversations(contactId: number): Promise<ChatwootConversation[]> {
    const result = await this.request<{ payload: ChatwootConversation[] }>(
      'GET',
      `/contacts/${contactId}/conversations`
    );
    return result.payload || [];
  }

  /**
   * Find open conversation for a contact in the inbox
   */
  async findOpenConversation(contactId: number): Promise<ChatwootConversation | null> {
    try {
      const conversations = await this.listContactConversations(contactId);
      
      // Business Rule: Find open conversation for this inbox
      const conversation = conversations.find(c => 
        c.inbox_id === this.inboxId && 
        (c.status === 'open' || c.status === 'pending')
      );

      return conversation || null;
    } catch (error) {
      console.error('[ChatwootClient] Error finding conversation:', error);
      return null;
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId: number): Promise<ChatwootConversation> {
    return this.request<ChatwootConversation>('GET', `/conversations/${conversationId}`);
  }

  /**
   * Create a new conversation
   */
  async createConversation(contactId: number, sourceId?: string): Promise<ChatwootConversation> {
    if (!this.inboxId) {
      throw new Error('Inbox ID is required to create conversation');
    }

    const payload: CreateChatwootConversationInput = {
      source_id: sourceId || `quayer_${Date.now()}`,
      inbox_id: this.inboxId,
      contact_id: contactId,
      status: 'open',
    };

    return this.request<ChatwootConversation>('POST', '/conversations', payload);
  }

  /**
   * Find or create conversation for a contact
   */
  async findOrCreateConversation(
    contactId: number,
    createNew: boolean = false
  ): Promise<ChatwootConversation> {
    if (!createNew) {
      // Observation: Try to find existing open conversation
      const existing = await this.findOpenConversation(contactId);
      if (existing) {
        return existing;
      }
    }

    // Business Rule: Create new conversation
    console.log(`[ChatwootClient] Creating new conversation for contact ${contactId}`);
    return this.createConversation(contactId);
  }

  /**
   * Toggle conversation status
   */
  async toggleConversationStatus(
    conversationId: number,
    status: 'open' | 'resolved' | 'pending' | 'snoozed'
  ): Promise<ChatwootConversation> {
    return this.request<ChatwootConversation>(
      'POST',
      `/conversations/${conversationId}/toggle_status`,
      { status }
    );
  }

  // ============================================
  // Messages
  // ============================================

  /**
   * List messages in a conversation
   */
  async listMessages(conversationId: number, before?: number): Promise<ChatwootMessage[]> {
    const query = before ? `?before=${before}` : '';
    const result = await this.request<{ payload: ChatwootMessage[] }>(
      'GET',
      `/conversations/${conversationId}/messages${query}`
    );
    return result.payload || [];
  }

  /**
   * Send a message to a conversation
   * @param conversationId Conversation ID
   * @param content Message content
   * @param options Additional options
   */
  async sendMessage(
    conversationId: number,
    content: string,
    options?: {
      messageType?: 'incoming' | 'outgoing';
      private?: boolean;
      contentType?: string;
      contentAttributes?: Record<string, any>;
      attachments?: Array<{ file_type: string; data_url: string }>;
    }
  ): Promise<ChatwootMessage> {
    // Business Rule: Add bot signature to prevent echo loops
    const signedContent = `${BOT_MARKER}${content}`;

    const payload: SendChatwootMessageInput = {
      content: signedContent,
      message_type: options?.messageType || 'incoming',
      private: options?.private || false,
    };

    if (options?.contentType) {
      payload.content_type = options.contentType as any;
    }

    if (options?.contentAttributes) {
      payload.content_attributes = options.contentAttributes;
    }

    // Business Rule: Handle attachments if present
    // Note: Chatwoot requires multipart/form-data for file uploads
    // For now, we support data URLs only
    
    return this.request<ChatwootMessage>(
      'POST',
      `/conversations/${conversationId}/messages`,
      payload
    );
  }

  /**
   * Send incoming message (from customer to Chatwoot)
   * Used when WhatsApp message is received
   */
  async sendIncomingMessage(
    conversationId: number,
    content: string,
    attachments?: ChatwootAttachment[]
  ): Promise<ChatwootMessage> {
    return this.sendMessage(conversationId, content, {
      messageType: 'incoming',
      attachments: attachments?.map(a => ({
        file_type: a.file_type,
        data_url: a.data_url,
      })),
    });
  }

  /**
   * Send outgoing message (from agent to customer)
   * Used when agent sends message from Chatwoot
   * Note: This is typically handled by Chatwoot itself
   */
  async sendOutgoingMessage(
    conversationId: number,
    content: string,
    options?: { private?: boolean; agentName?: string }
  ): Promise<ChatwootMessage> {
    // Business Rule: Optionally sign message with agent name
    let finalContent = content;
    if (options?.agentName) {
      finalContent = `*${options.agentName}:* ${content}`;
    }

    return this.sendMessage(conversationId, finalContent, {
      messageType: 'outgoing',
      private: options?.private,
    });
  }

  // ============================================
  // Inbox
  // ============================================

  /**
   * Get inbox information
   */
  async getInbox(inboxId?: number): Promise<ChatwootInbox> {
    const id = inboxId || this.inboxId;
    if (!id) {
      throw new Error('Inbox ID is required');
    }
    return this.request<ChatwootInbox>('GET', `/inboxes/${id}`);
  }

  /**
   * List all inboxes
   */
  async listInboxes(): Promise<ChatwootInbox[]> {
    const result = await this.request<{ payload: ChatwootInbox[] }>('GET', '/inboxes');
    return result.payload || [];
  }

  /**
   * Update inbox webhook URL
   * Note: This may require additional permissions
   */
  async updateInboxWebhook(inboxId: number, webhookUrl: string): Promise<ChatwootInbox> {
    return this.request<ChatwootInbox>('PATCH', `/inboxes/${inboxId}`, {
      callback_webhook_url: webhookUrl,
    });
  }

  /**
   * Validate inbox type is API channel
   * @param inboxId Inbox ID to validate
   * @returns Validation result with inbox info
   */
  async validateInboxType(inboxId?: number): Promise<{
    valid: boolean;
    inbox?: ChatwootInbox;
    channelType?: string;
    error?: string;
  }> {
    try {
      const id = inboxId || this.inboxId;
      if (!id) {
        return { valid: false, error: 'Inbox ID is required' };
      }

      const inbox = await this.getInbox(id);

      // Valid channel types for WhatsApp integration:
      // - Channel::Api (API channel - recommended)
      // - Channel::Whatsapp (native WhatsApp channel)
      const validChannelTypes = ['Channel::Api', 'Channel::Whatsapp', 'api', 'whatsapp'];
      const channelType = inbox.channel_type || '';
      const isValid = validChannelTypes.some(type =>
        channelType.toLowerCase().includes(type.toLowerCase())
      );

      if (!isValid) {
        console.warn(`[ChatwootClient] Invalid inbox type: ${channelType}. Expected API or WhatsApp channel.`);
        return {
          valid: false,
          inbox,
          channelType,
          error: `Tipo de inbox inválido: "${channelType}". Use um inbox do tipo "API" para integração com WhatsApp.`,
        };
      }

      console.log(`[ChatwootClient] Inbox ${id} validated: ${channelType}`);
      return { valid: true, inbox, channelType };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  // ============================================
  // High-Level Operations
  // ============================================

  /**
   * Sync a WhatsApp message to Chatwoot
   * @param phoneNumber Customer's phone number
   * @param contactName Customer's name
   * @param message Message content
   * @param options Additional options
   */
  async syncIncomingWhatsAppMessage(
    phoneNumber: string,
    contactName: string,
    message: string,
    options?: {
      attachments?: ChatwootAttachment[];
      createNewConversation?: boolean;
    }
  ): Promise<{ contact: ChatwootContact; conversation: ChatwootConversation; message: ChatwootMessage }> {
    // Step 1: Find or create contact
    const contact = await this.findOrCreateContact(phoneNumber, contactName);
    console.log(`[ChatwootClient] Contact: ${contact.id} - ${contact.name}`);

    // Step 2: Find or create conversation
    const conversation = await this.findOrCreateConversation(
      contact.id,
      options?.createNewConversation
    );
    console.log(`[ChatwootClient] Conversation: ${conversation.id} - Status: ${conversation.status}`);

    // Step 3: Send the message
    const sentMessage = await this.sendIncomingMessage(
      conversation.id,
      message,
      options?.attachments
    );
    console.log(`[ChatwootClient] Message sent: ${sentMessage.id}`);

    return {
      contact,
      conversation,
      message: sentMessage,
    };
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a ChatwootClient from stored configuration
 */
export function createChatwootClient(config: ChatwootConfig): ChatwootClient {
  return ChatwootClient.fromConfig(config);
}
