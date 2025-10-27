/**
 * WhatsApp Orchestrator
 *
 * Orquestrador principal que gerencia múltiplos providers de WhatsApp
 * Delega operações para o provider correto baseado em instance.brokerType
 */

import type { IWhatsAppProvider } from './provider.interface';
import type {
  BrokerType,
  CreateInstanceInput,
  InstanceResult,
  InstanceStatus,
  QRCodeResult,
  PairingCodeResult,
  SendTextInput,
  SendMediaInput,
  MessageResult,
  WebhookConfig,
  NormalizedWebhook,
} from './provider.types';

export class WhatsAppOrchestrator {
  private providers: Map<BrokerType, IWhatsAppProvider>;

  constructor() {
    this.providers = new Map();
  }

  /**
   * Registrar um provider
   */
  registerProvider(brokerType: BrokerType, provider: IWhatsAppProvider): void {
    this.providers.set(brokerType, provider);
    console.log(`[Orchestrator] Provider registered: ${brokerType} (${provider.name} v${provider.version})`);
  }

  /**
   * Obter provider pelo tipo
   */
  private getProvider(brokerType: BrokerType): IWhatsAppProvider {
    const provider = this.providers.get(brokerType);
    if (!provider) {
      throw new Error(`Provider ${brokerType} not available. Available providers: ${Array.from(this.providers.keys()).join(', ')}`);
    }
    return provider;
  }

  /**
   * Listar providers disponíveis
   */
  getAvailableProviders(): BrokerType[] {
    return Array.from(this.providers.keys());
  }

  // ===== INSTÂNCIAS =====
  async createInstance(
    brokerType: BrokerType,
    data: CreateInstanceInput
  ): Promise<InstanceResult> {
    const provider = this.getProvider(brokerType);
    console.log(`[Orchestrator] Creating instance with ${brokerType}`);
    return provider.createInstance(data);
  }

  async deleteInstance(
    instanceId: string,
    brokerType: BrokerType
  ): Promise<void> {
    const provider = this.getProvider(brokerType);
    console.log(`[Orchestrator] Deleting instance ${instanceId} from ${brokerType}`);
    return provider.deleteInstance(instanceId);
  }

  async getInstanceStatus(
    instanceId: string,
    brokerType: BrokerType
  ): Promise<InstanceStatus> {
    const provider = this.getProvider(brokerType);
    return provider.getInstanceStatus(instanceId);
  }

  // ===== QR CODE =====
  async generateQRCode(
    instanceId: string,
    brokerType: BrokerType
  ): Promise<QRCodeResult> {
    const provider = this.getProvider(brokerType);
    console.log(`[Orchestrator] Generating QR Code for ${instanceId} via ${brokerType}`);
    return provider.generateQRCode(instanceId);
  }

  async getPairingCode(
    instanceId: string,
    brokerType: BrokerType
  ): Promise<PairingCodeResult> {
    const provider = this.getProvider(brokerType);
    console.log(`[Orchestrator] Generating pairing code for ${instanceId} via ${brokerType}`);
    return provider.getPairingCode(instanceId);
  }

  async disconnect(instanceId: string, brokerType: BrokerType): Promise<void> {
    const provider = this.getProvider(brokerType);
    console.log(`[Orchestrator] Disconnecting instance ${instanceId} from ${brokerType}`);
    return provider.disconnect(instanceId);
  }

  async restart(instanceId: string, brokerType: BrokerType): Promise<void> {
    const provider = this.getProvider(brokerType);
    console.log(`[Orchestrator] Restarting instance ${instanceId} on ${brokerType}`);
    return provider.restart(instanceId);
  }

  // ===== MENSAGENS =====
  async sendText(
    instanceId: string,
    brokerType: BrokerType,
    data: SendTextInput
  ): Promise<MessageResult> {
    const provider = this.getProvider(brokerType);

    // Validação de número
    const validNumber = this.validatePhoneNumber(data.to);
    if (!validNumber) {
      throw new Error('Invalid phone number format');
    }

    // Delay se configurado
    if (data.delay && data.delay > 0) {
      console.log(`[Orchestrator] Delaying message by ${data.delay}s`);
      await this.sleep(data.delay * 1000);
    }

    console.log(`[Orchestrator] Sending text to ${validNumber} via ${brokerType}`);
    return provider.sendText(instanceId, {
      ...data,
      to: validNumber,
    });
  }

  async sendMedia(
    instanceId: string,
    brokerType: BrokerType,
    data: SendMediaInput
  ): Promise<MessageResult> {
    const provider = this.getProvider(brokerType);

    const validNumber = this.validatePhoneNumber(data.to);
    if (!validNumber) {
      throw new Error('Invalid phone number format');
    }

    console.log(`[Orchestrator] Sending ${data.mediaType} to ${validNumber} via ${brokerType}`);
    return provider.sendMedia(instanceId, {
      ...data,
      to: validNumber,
    });
  }

  // ===== WEBHOOKS =====
  async configureWebhook(
    instanceId: string,
    brokerType: BrokerType,
    config: WebhookConfig
  ): Promise<void> {
    const provider = this.getProvider(brokerType);
    console.log(`[Orchestrator] Configuring webhook for ${instanceId} on ${brokerType}`);
    return provider.configureWebhook(instanceId, config);
  }

  async normalizeWebhook(
    brokerType: BrokerType,
    rawWebhook: any
  ): Promise<NormalizedWebhook> {
    const provider = this.getProvider(brokerType);
    return provider.normalizeWebhook(rawWebhook);
  }

  // ===== PROFILE =====
  async getProfilePicture(
    instanceId: string,
    brokerType: BrokerType,
    number: string
  ): Promise<string | null> {
    const provider = this.getProvider(brokerType);
    return provider.getProfilePicture(instanceId, number);
  }

  async updateProfilePicture(
    instanceId: string,
    brokerType: BrokerType,
    imageUrl: string
  ): Promise<void> {
    const provider = this.getProvider(brokerType);
    console.log(`[Orchestrator] Updating profile picture for ${instanceId} on ${brokerType}`);
    return provider.updateProfilePicture(instanceId, imageUrl);
  }

  // ===== HEALTH =====
  async healthCheck(brokerType: BrokerType): Promise<boolean> {
    const provider = this.getProvider(brokerType);
    return provider.healthCheck();
  }

  async healthCheckAll(): Promise<Record<BrokerType, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [brokerType, provider] of this.providers) {
      try {
        results[brokerType] = await provider.healthCheck();
      } catch (error) {
        console.error(`[Orchestrator] Health check failed for ${brokerType}:`, error);
        results[brokerType] = false;
      }
    }

    return results as Record<BrokerType, boolean>;
  }

  // ===== HELPERS =====
  private validatePhoneNumber(number: string): string | null {
    // Remove todos os caracteres não numéricos
    const cleaned = number.replace(/\D/g, '');

    // Mínimo 10 dígitos (código de área + número)
    if (cleaned.length < 10) {
      return null;
    }

    // Retorna apenas números
    return cleaned;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const orchestrator = new WhatsAppOrchestrator();
