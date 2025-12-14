/**
 * Chatwoot Sync Service
 * 
 * @description Handles synchronization of WhatsApp messages to Chatwoot.
 * Called by the main webhook handler when messages are received.
 * 
 * @version 1.0.0
 */

import { database } from '@/services/database';
import { ChatwootRepository } from '../repositories/chatwoot.repository';
import { ChatwootClient } from './chatwoot.client';
import type { ChatwootConfig, ChatwootAttachment } from '../chatwoot.interfaces';

/**
 * @interface SyncMessageInput
 * @description Input for syncing a WhatsApp message to Chatwoot
 */
export interface SyncMessageInput {
  instanceId: string;
  organizationId: string;
  phoneNumber: string;
  contactName?: string;
  messageContent: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contact';
  mediaUrl?: string;
  mediaMimeType?: string;
  isFromGroup?: boolean;
}

/**
 * @interface SyncResult
 * @description Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  synced: boolean;
  reason?: string;
  chatwootMessageId?: number;
  chatwootConversationId?: number;
  error?: string;
}

/**
 * @class ChatwootSyncService
 * @description Service for syncing WhatsApp messages to Chatwoot
 */
export class ChatwootSyncService {
  private repository: ChatwootRepository;

  constructor() {
    this.repository = new ChatwootRepository(database);
  }

  /**
   * Check if Chatwoot sync is enabled for a connection
   */
  async isEnabled(instanceId: string, organizationId: string): Promise<boolean> {
    return this.repository.isEnabled(instanceId, organizationId);
  }

  /**
   * Get Chatwoot configuration for a connection
   */
  async getConfig(instanceId: string, organizationId: string): Promise<ChatwootConfig | null> {
    return this.repository.getConfig(instanceId, organizationId);
  }

  /**
   * Sync an incoming WhatsApp message to Chatwoot
   * 
   * @param input Message data to sync
   * @returns Sync result
   */
  async syncIncomingMessage(input: SyncMessageInput): Promise<SyncResult> {
    const {
      instanceId,
      organizationId,
      phoneNumber,
      contactName,
      messageContent,
      messageType,
      mediaUrl,
      mediaMimeType,
      isFromGroup,
    } = input;

    console.log('[ChatwootSync] Syncing message:', {
      instanceId,
      phoneNumber,
      messageType,
      contentPreview: messageContent?.substring(0, 50),
    });

    try {
      // Step 1: Get Chatwoot configuration
      const config = await this.getConfig(instanceId, organizationId);

      if (!config || !config.enabled) {
        console.log('[ChatwootSync] Chatwoot not enabled for this connection');
        return { success: true, synced: false, reason: 'not_enabled' };
      }

      // Step 2: Check if we should ignore groups
      if (isFromGroup && config.ignoreGroups) {
        console.log('[ChatwootSync] Ignoring group message');
        return { success: true, synced: false, reason: 'group_ignored' };
      }

      // Step 3: Create Chatwoot client
      const client = ChatwootClient.fromConfig(config);

      // Step 4: Prepare attachments if media
      let attachments: ChatwootAttachment[] | undefined;
      if (mediaUrl && messageType !== 'text') {
        attachments = [{
          file_type: this.mapMessageTypeToFileType(messageType),
          data_url: mediaUrl,
        }];
      }

      // Step 5: Sync message to Chatwoot
      const result = await client.syncIncomingWhatsAppMessage(
        phoneNumber,
        contactName || phoneNumber,
        messageContent || '',
        {
          attachments,
          createNewConversation: config.createNewConversation,
        }
      );

      console.log('[ChatwootSync] Message synced:', {
        contactId: result.contact.id,
        conversationId: result.conversation.id,
        messageId: result.message.id,
      });

      return {
        success: true,
        synced: true,
        chatwootMessageId: result.message.id,
        chatwootConversationId: result.conversation.id,
      };

    } catch (error: any) {
      console.error('[ChatwootSync] Error syncing message:', error);
      return {
        success: false,
        synced: false,
        error: error.message,
      };
    }
  }

  /**
   * Sync contact name update to Chatwoot
   */
  async syncContactName(
    instanceId: string,
    organizationId: string,
    phoneNumber: string,
    newName: string
  ): Promise<SyncResult> {
    try {
      const config = await this.getConfig(instanceId, organizationId);

      if (!config || !config.enabled) {
        return { success: true, synced: false, reason: 'not_enabled' };
      }

      const client = ChatwootClient.fromConfig(config);
      const contact = await client.findContactByPhone(phoneNumber);

      if (!contact) {
        return { success: true, synced: false, reason: 'contact_not_found' };
      }

      // Only update if name starts with ~ (intelligent names)
      if (contact.name?.startsWith('~')) {
        await client.updateContactName(contact.id, `~${newName}`);
        console.log('[ChatwootSync] Contact name updated:', { phoneNumber, newName });
        return { success: true, synced: true };
      }

      return { success: true, synced: false, reason: 'fixed_name' };

    } catch (error: any) {
      console.error('[ChatwootSync] Error syncing contact name:', error);
      return { success: false, synced: false, error: error.message };
    }
  }

  /**
   * Map internal message type to Chatwoot file type
   */
  private mapMessageTypeToFileType(
    messageType: string
  ): 'image' | 'audio' | 'video' | 'file' | 'location' | 'contact' | 'fallback' {
    switch (messageType) {
      case 'image':
        return 'image';
      case 'audio':
        return 'audio';
      case 'video':
        return 'video';
      case 'document':
        return 'file';
      case 'location':
        return 'location';
      case 'contact':
        return 'contact';
      default:
        return 'fallback';
    }
  }
}

// Export singleton instance
export const chatwootSyncService = new ChatwootSyncService();
