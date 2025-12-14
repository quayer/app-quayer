/**
 * Webhooks Service
 * Handles webhook dispatching and delivery
 *
 * SISTEMA DE CALLBACK:
 * Se o webhook do cliente responder com um JSON contendo:
 * {
 *   "messages": [{ "type": "text", "content": "Resposta" }],
 *   "actions": [{ "type": "close_session" }]
 * }
 * O sistema automaticamente envia as mensagens e executa as ações
 */

import { webhooksRepository } from './webhooks.repository';
import type { WebhookPayload } from './webhooks.interfaces';
import { logger } from '@/services/logger';

// TODO: Implementar @/lib/message-sender para callback responses
type AnyCallbackResponse = any;

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
   * Returns the response body for callback processing
   *
   * Suporta callback responses em múltiplos formatos:
   * - Formato N8N: [{ type, content: { text, delay } }]
   * - Formato estruturado: { messages: [...], actions: [...] }
   */
  private async dispatchWebhook(
    url: string,
    payload: WebhookPayload,
    secret?: string | null,
    timeout: number = 30000
  ): Promise<{ success: boolean; response?: any; error?: string; callbackData?: AnyCallbackResponse }> {
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

      // Tentar parsear resposta como JSON para callback
      let callbackData: AnyCallbackResponse | undefined;
      if (responseData) {
        try {
          const parsed = JSON.parse(responseData);

          // ✅ FORMATO 1: Array direto (N8N format)
          // [{ type: "text", content: { text: "...", delay: 1000 } }]
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
            callbackData = parsed;
            logger.info('[Webhooks] Callback response detectado (formato N8N array)', {
              messagesCount: parsed.length,
              firstMessageType: parsed[0].type,
            });
          }
          // ✅ FORMATO 2: Objeto estruturado
          // { messages: [...], actions: [...] }
          else if (parsed.messages || parsed.actions) {
            callbackData = parsed;
            logger.info('[Webhooks] Callback response detectado (formato estruturado)', {
              messagesCount: parsed.messages?.length || 0,
              actionsCount: parsed.actions?.length || 0,
            });
          }
        } catch {
          // Não é JSON válido, ignorar
        }
      }

      if (response.ok) {
        return {
          success: true,
          response: {
            status: response.status,
            body: responseData,
          },
          callbackData,
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

        // TODO: Implementar callback response quando @/lib/message-sender estiver disponível
        // Suporta formatos: N8N array, objeto estruturado, content como string ou objeto
        if (result.callbackData) {
          logger.info('Callback response detected but not processed (message-sender not implemented)', {
            webhookId: webhook.id,
            deliveryId: delivery.id,
            format: Array.isArray(result.callbackData) ? 'n8n_array' : 'structured',
          });
        }
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
   * Extract callback context from webhook data
   */
  private extractCallbackContext(data: any): {
    instanceId?: string;
    to?: string;
    sessionId?: string;
  } {
    // Dados do Quayer enriched payload
    if (data.quayer) {
      return {
        instanceId: data.quayer.instanceId,
        to: data.uaz?.sender?.replace('@s.whatsapp.net', '') || data.context?.contact?.phoneNumber,
        sessionId: data.context?.session?.id,
      };
    }

    // Dados de mensagem direta
    if (data.instanceId && data.sender) {
      return {
        instanceId: data.instanceId,
        to: data.sender.replace('@s.whatsapp.net', ''),
        sessionId: data.sessionId,
      };
    }

    // Fallback para campos comuns
    return {
      instanceId: data.instanceId || data.instance?.id,
      to: data.to || data.sender || data.phoneNumber || data.contact?.phoneNumber,
      sessionId: data.sessionId || data.session?.id,
    };
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
