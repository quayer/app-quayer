/**
 * Webhooks Service
 * Handles webhook dispatching and delivery
 */

import { webhooksRepository } from './webhooks.repository';
import type { WebhookPayload } from './webhooks.interfaces';
import { logger } from '@/services/logger';

export class WebhooksService {
  /**
   * Build webhook URL with dynamic parameters
   */
  private buildWebhookUrl(
    baseUrl: string,
    event: string,
    data: any,
    pathParams?: any,
    addUrlEvents?: boolean,
    addUrlTypesMessages?: string[]
  ): string {
    let url = baseUrl;

    // Replace path parameters {placeholder} with actual values
    if (pathParams && typeof pathParams === 'object') {
      Object.entries(pathParams).forEach(([key, value]) => {
        url = url.replace(`{${key}}`, String(value));
      });
    }

    // Add event to URL if addUrlEvents is true
    if (addUrlEvents) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}event=${encodeURIComponent(event)}`;
    }

    // Add message type to URL if applicable
    if (addUrlTypesMessages && addUrlTypesMessages.length > 0 && data?.messageType) {
      if (addUrlTypesMessages.includes(data.messageType)) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}messageType=${encodeURIComponent(data.messageType)}`;
      }
    }

    return url;
  }

  /**
   * Check if event should be excluded based on webhook filters
   */
  private shouldExcludeEvent(
    event: string,
    data: any,
    excludeMessages: boolean,
    addUrlTypesMessages?: string[]
  ): boolean {
    // Exclude all message events if excludeMessages is true
    if (excludeMessages && event.startsWith('message.')) {
      return true;
    }

    // If message type filtering is enabled, exclude messages not in the list
    if (addUrlTypesMessages && addUrlTypesMessages.length > 0 && event.startsWith('message.')) {
      if (data?.messageType && !addUrlTypesMessages.includes(data.messageType)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Dispatch webhook to a specific URL
   */
  private async dispatchWebhook(
    url: string,
    payload: WebhookPayload,
    secret?: string | null,
    timeout: number = 30000
  ): Promise<{ success: boolean; response?: any; error?: string }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Quayer-Webhooks/1.0',
        'X-Webhook-Event': payload.event,
        'X-Webhook-Timestamp': payload.timestamp,
      };

      if (secret) {
        // Generate HMAC signature for security
        const crypto = await import('crypto');
        const signature = crypto
          .createHmac('sha256', secret)
          .update(JSON.stringify(payload))
          .digest('hex');
        headers['X-Webhook-Signature'] = signature;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeout),
      });

      const responseData = await response.text();

      if (response.ok) {
        return {
          success: true,
          response: {
            status: response.status,
            body: responseData,
          },
        };
      } else {
        return {
          success: false,
          error: `HTTP ${response.status}: ${responseData}`,
          response: {
            status: response.status,
            body: responseData,
          },
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Trigger webhook event for an organization
   */
  async trigger(organizationId: string, event: string, data: any): Promise<void> {
    logger.info('Triggering webhook event', { organizationId, event });

    // Find all active webhooks for this event
    const webhooks = await webhooksRepository.findWebhooksByEvent(event, organizationId);

    if (webhooks.length === 0) {
      logger.debug('No webhooks found for event', { event, organizationId });
      return;
    }

    // Dispatch webhooks in parallel
    const promises = webhooks.map(async (webhook) => {
      // Check if event should be excluded based on filters
      if (this.shouldExcludeEvent(
        event,
        data,
        webhook.excludeMessages,
        webhook.addUrlTypesMessages as string[]
      )) {
        logger.debug('Event excluded by webhook filters', {
          webhookId: webhook.id,
          event,
          excludeMessages: webhook.excludeMessages,
          addUrlTypesMessages: webhook.addUrlTypesMessages,
        });
        return;
      }

      // Build dynamic webhook URL
      const finalUrl = this.buildWebhookUrl(
        webhook.url,
        event,
        data,
        webhook.pathParams,
        webhook.addUrlEvents,
        webhook.addUrlTypesMessages as string[]
      );

      // Create delivery record
      const delivery = await webhooksRepository.createDelivery(webhook.id, event, data);

      const payload: WebhookPayload = {
        event,
        data,
        timestamp: new Date().toISOString(),
        webhookId: webhook.id,
      };

      // Dispatch webhook with custom timeout
      const result = await this.dispatchWebhook(
        finalUrl,
        payload,
        webhook.secret,
        webhook.timeout
      );

      // Update delivery record
      await webhooksRepository.updateDelivery(delivery.id, {
        status: result.success ? 'success' : 'failure',
        response: result.response || { error: result.error },
        attempts: 1,
        completedAt: new Date(),
      });

      if (result.success) {
        logger.info('Webhook delivered successfully', {
          webhookId: webhook.id,
          deliveryId: delivery.id,
        });
      } else {
        logger.error('Webhook delivery failed', {
          webhookId: webhook.id,
          deliveryId: delivery.id,
          error: result.error,
        });
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Retry failed webhook delivery
   */
  async retry(deliveryId: string): Promise<boolean> {
    const delivery = await webhooksRepository.getDeliveryById(deliveryId);

    if (!delivery || !delivery.webhook) {
      return false;
    }

    if (delivery.status === 'success') {
      return true; // Already successful
    }

    const payload: WebhookPayload = {
      event: delivery.event,
      data: delivery.payload,
      timestamp: new Date().toISOString(),
      webhookId: delivery.webhookId,
    };

    // Build dynamic URL
    const finalUrl = this.buildWebhookUrl(
      delivery.webhook.url,
      delivery.event,
      delivery.payload,
      delivery.webhook.pathParams,
      delivery.webhook.addUrlEvents,
      delivery.webhook.addUrlTypesMessages as string[]
    );

    const result = await this.dispatchWebhook(
      finalUrl,
      payload,
      delivery.webhook.secret,
      delivery.webhook.timeout
    );

    await webhooksRepository.updateDelivery(deliveryId, {
      status: result.success ? 'success' : 'failure',
      response: result.response || { error: result.error },
      attempts: delivery.attempts + 1,
      completedAt: result.success ? new Date() : undefined,
    });

    return result.success;
  }
}

// Export singleton instance
export const webhooksService = new WebhooksService();
