/**
 * Chatwoot Repository
 * 
 * @description Repository for managing Chatwoot integration configurations.
 * Uses the IntegrationConfig model in Prisma.
 * 
 * @version 1.0.0
 */

import type { PrismaClient, IntegrationConfig } from '@prisma/client';
import type { ChatwootConfig, UpdateChatwootConfigInput } from '../chatwoot.interfaces';

/**
 * @class ChatwootRepository
 * @description Repository for Chatwoot configuration CRUD operations
 */
export class ChatwootRepository {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Parse JSON settings to ChatwootConfig
   */
  private parseConfig(integration: IntegrationConfig | null): ChatwootConfig | null {
    if (!integration) return null;

    const settings = integration.settings as Record<string, any> || {};

    return {
      enabled: integration.isActive,
      url: integration.apiUrl || '',
      accessToken: integration.apiKey || settings.access_token || '',
      accountId: settings.account_id || 0,
      inboxId: settings.inbox_id || 0,
      ignoreGroups: settings.ignore_groups ?? false,
      signMessages: settings.sign_messages ?? true,
      createNewConversation: settings.create_new_conversation ?? false,
      typingIndicator: settings.typing_indicator ?? true,
      typingDelayMs: settings.typing_delay_ms ?? 1500,
    };
  }

  /**
   * Convert ChatwootConfig to IntegrationConfig format
   */
  private toIntegrationData(
    config: ChatwootConfig | UpdateChatwootConfigInput,
    connectionId: string,
    organizationId: string
  ): Partial<IntegrationConfig> {
    return {
      type: 'CHATWOOT',
      name: `Chatwoot - Connection ${connectionId}`,
      isActive: config.enabled,
      apiUrl: config.url,
      apiKey: config.accessToken,
      settings: {
        account_id: config.accountId,
        inbox_id: config.inboxId,
        ignore_groups: config.ignoreGroups,
        sign_messages: config.signMessages,
        create_new_conversation: config.createNewConversation,
        typing_indicator: config.typingIndicator,
        typing_delay_ms: config.typingDelayMs,
        connection_id: connectionId,
      },
      organizationId,
    } as any;
  }

  // ============================================
  // Read Operations
  // ============================================

  /**
   * Get Chatwoot configuration for a connection
   * @param connectionId The WhatsApp connection/instance ID
   * @param organizationId The organization ID
   */
  async getConfig(
    connectionId: string,
    organizationId: string
  ): Promise<ChatwootConfig | null> {
    // Business Rule: Find Chatwoot integration for this connection
    const integration = await this.prisma.integrationConfig.findFirst({
      where: {
        organizationId,
        type: 'CHATWOOT',
        settings: {
          path: ['connection_id'],
          equals: connectionId,
        },
      },
    });

    return this.parseConfig(integration);
  }

  /**
   * Get Chatwoot configuration by organization only
   * (for organizations with single connection)
   */
  async getOrgConfig(organizationId: string): Promise<ChatwootConfig | null> {
    const integration = await this.prisma.integrationConfig.findFirst({
      where: {
        organizationId,
        type: 'CHATWOOT',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return this.parseConfig(integration);
  }

  /**
   * Get all Chatwoot configurations for an organization
   */
  async listConfigs(organizationId: string): Promise<Array<{
    connectionId: string;
    config: ChatwootConfig;
  }>> {
    const integrations = await this.prisma.integrationConfig.findMany({
      where: {
        organizationId,
        type: 'CHATWOOT',
      },
    });

    return integrations.map(integration => ({
      connectionId: (integration.settings as any)?.connection_id || '',
      config: this.parseConfig(integration)!,
    })).filter(item => item.config !== null);
  }

  /**
   * Check if Chatwoot is enabled for a connection
   */
  async isEnabled(connectionId: string, organizationId: string): Promise<boolean> {
    const config = await this.getConfig(connectionId, organizationId);
    return config?.enabled ?? false;
  }

  // ============================================
  // Write Operations
  // ============================================

  /**
   * Create or update Chatwoot configuration
   * @param connectionId The WhatsApp connection/instance ID
   * @param organizationId The organization ID
   * @param config The Chatwoot configuration
   */
  async upsertConfig(
    connectionId: string,
    organizationId: string,
    config: ChatwootConfig | UpdateChatwootConfigInput
  ): Promise<ChatwootConfig> {
    // Business Rule: Find existing integration
    const existing = await this.prisma.integrationConfig.findFirst({
      where: {
        organizationId,
        type: 'CHATWOOT',
        settings: {
          path: ['connection_id'],
          equals: connectionId,
        },
      },
    });

    const data = this.toIntegrationData(config, connectionId, organizationId);

    let integration: IntegrationConfig;

    if (existing) {
      // Update existing
      integration = await this.prisma.integrationConfig.update({
        where: { id: existing.id },
        data: {
          isActive: data.isActive,
          apiUrl: data.apiUrl || existing.apiUrl,
          apiKey: data.apiKey || existing.apiKey,
          settings: {
            ...((existing.settings as any) || {}),
            ...((data.settings as any) || {}),
          },
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new
      integration = await this.prisma.integrationConfig.create({
        data: {
          type: 'CHATWOOT',
          name: data.name as string,
          isActive: data.isActive ?? false,
          apiUrl: data.apiUrl,
          apiKey: data.apiKey,
          settings: data.settings as any,
          organizationId,
        },
      });
    }

    return this.parseConfig(integration)!;
  }

  /**
   * Delete Chatwoot configuration
   */
  async deleteConfig(connectionId: string, organizationId: string): Promise<boolean> {
    const existing = await this.prisma.integrationConfig.findFirst({
      where: {
        organizationId,
        type: 'CHATWOOT',
        settings: {
          path: ['connection_id'],
          equals: connectionId,
        },
      },
    });

    if (!existing) return false;

    await this.prisma.integrationConfig.delete({
      where: { id: existing.id },
    });

    return true;
  }

  /**
   * Disable Chatwoot integration
   */
  async disable(connectionId: string, organizationId: string): Promise<boolean> {
    const existing = await this.prisma.integrationConfig.findFirst({
      where: {
        organizationId,
        type: 'CHATWOOT',
        settings: {
          path: ['connection_id'],
          equals: connectionId,
        },
      },
    });

    if (!existing) return false;

    await this.prisma.integrationConfig.update({
      where: { id: existing.id },
      data: { isActive: false },
    });

    return true;
  }

  // ============================================
  // Webhook URL Helper
  // ============================================

  /**
   * Generate webhook URL for Chatwoot inbox configuration
   */
  generateWebhookUrl(baseUrl: string, connectionId: string): string {
    // Business Rule: Webhook URL includes connection ID for routing
    return `${baseUrl}/api/v1/webhooks/chatwoot/${connectionId}`;
  }
}
