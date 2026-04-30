/**
 * WhatsApp Orchestrator
 *
 * Orquestrador principal que gerencia múltiplos providers de WhatsApp
 * Delega operações para o provider correto baseado em instance.brokerType
 *
 * Provider-Agnostic API:
 * A API da Quayer funciona de forma idêntica independente do provider (UAZAPI, CloudAPI, etc.)
 * Todas as operações são delegadas para o adapter correto automaticamente.
 *
 * Capability-based dispatch:
 * Antes de delegar, o orquestrador verifica se o provider suporta a capability necessária
 * usando assertCapability(). Se não suportar, lança ProviderCapabilityError.
 */

import type { IWhatsAppProvider } from './provider.interface';
import { ProviderCapability } from './provider.types';
import type {
  BrokerType,
  CreateInstanceInput,
  InstanceResult,
  InstanceStatus,
  QRCodeResult,
  PairingCodeResult,
  SendTextInput,
  SendMediaInput,
  SendLocationInput,
  SendContactInput,
  SendInteractiveListInput,
  SendInteractiveButtonsInput,
  MessageResult,
  WebhookConfig,
  WebhookSetupInstructions,
  NormalizedWebhook,
  PresenceType,
  MediaDownloadResult,
  SendPixButtonInput,
  SendPaymentRequestInput,
} from './provider.types';
import { assertCapability, hasCapability, ProviderCapabilityError } from './capability-helpers';
import type {
  IMessagingCapability,
  IInteractiveCapability,
  IInstanceCapability,
  IWebhookCapability,
  IProfileCapability,
  IPaymentCapability,
} from './capabilities';

export { ProviderCapabilityError };

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

  /**
   * Obter capabilities de um provider específico
   */
  getProviderCapabilities(brokerType: BrokerType): ProviderCapability[] {
    const provider = this.getProvider(brokerType);
    return [...provider.capabilities];
  }

  /**
   * Listar providers que suportam uma determinada capability
   */
  getProvidersWithCapability(capability: ProviderCapability): BrokerType[] {
    const result: BrokerType[] = [];
    for (const [brokerType, provider] of this.providers) {
      if (hasCapability(provider, capability)) {
        result.push(brokerType);
      }
    }
    return result;
  }

  // ===== INSTÂNCIAS =====
  async createInstance(
    brokerType: BrokerType,
    data: CreateInstanceInput
  ): Promise<InstanceResult> {
    const provider = this.getProvider(brokerType);
    const instanceProvider = assertCapability<IInstanceCapability>(provider, ProviderCapability.INSTANCE_MANAGEMENT);
    console.log(`[Orchestrator] Creating instance with ${brokerType}`);
    return instanceProvider.createInstance(data);
  }

  async deleteInstance(
    instanceId: string,
    brokerType: BrokerType
  ): Promise<void> {
    const provider = this.getProvider(brokerType);
    const instanceProvider = assertCapability<IInstanceCapability>(provider, ProviderCapability.INSTANCE_MANAGEMENT);
    console.log(`[Orchestrator] Deleting instance ${instanceId} from ${brokerType}`);
    return instanceProvider.deleteInstance(instanceId);
  }

  async getInstanceStatus(
    instanceId: string,
    brokerType: BrokerType
  ): Promise<InstanceStatus> {
    const provider = this.getProvider(brokerType);
    const instanceProvider = assertCapability<IInstanceCapability>(provider, ProviderCapability.INSTANCE_MANAGEMENT);
    return instanceProvider.getInstanceStatus(instanceId);
  }

  // ===== QR CODE =====
  async generateQRCode(
    instanceId: string,
    brokerType: BrokerType
  ): Promise<QRCodeResult> {
    const provider = this.getProvider(brokerType);
    const instanceProvider = assertCapability<IInstanceCapability>(provider, ProviderCapability.INSTANCE_MANAGEMENT);
    console.log(`[Orchestrator] Generating QR Code for ${instanceId} via ${brokerType}`);
    return instanceProvider.generateQRCode(instanceId);
  }

  async getPairingCode(
    instanceId: string,
    brokerType: BrokerType
  ): Promise<PairingCodeResult> {
    const provider = this.getProvider(brokerType);
    const instanceProvider = assertCapability<IInstanceCapability>(provider, ProviderCapability.INSTANCE_MANAGEMENT);
    console.log(`[Orchestrator] Generating pairing code for ${instanceId} via ${brokerType}`);
    return instanceProvider.getPairingCode(instanceId);
  }

  async disconnect(instanceId: string, brokerType: BrokerType): Promise<void> {
    const provider = this.getProvider(brokerType);
    const instanceProvider = assertCapability<IInstanceCapability>(provider, ProviderCapability.INSTANCE_MANAGEMENT);
    console.log(`[Orchestrator] Disconnecting instance ${instanceId} from ${brokerType}`);
    return instanceProvider.disconnect(instanceId);
  }

  async restart(instanceId: string, brokerType: BrokerType): Promise<void> {
    const provider = this.getProvider(brokerType);
    const instanceProvider = assertCapability<IInstanceCapability>(provider, ProviderCapability.INSTANCE_MANAGEMENT);
    console.log(`[Orchestrator] Restarting instance ${instanceId} on ${brokerType}`);
    return instanceProvider.restart(instanceId);
  }

  // ===== MENSAGENS BÁSICAS =====
  async sendText(
    instanceId: string,
    brokerType: BrokerType,
    data: SendTextInput
  ): Promise<MessageResult> {
    const provider = this.getProvider(brokerType);
    const messagingProvider = assertCapability<IMessagingCapability>(provider, ProviderCapability.MESSAGING);

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
    return messagingProvider.sendText(instanceId, {
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
    const messagingProvider = assertCapability<IMessagingCapability>(provider, ProviderCapability.MESSAGING);

    const validNumber = this.validatePhoneNumber(data.to);
    if (!validNumber) {
      throw new Error('Invalid phone number format');
    }

    console.log(`[Orchestrator] Sending ${data.mediaType} to ${validNumber} via ${brokerType}`);
    return messagingProvider.sendMedia(instanceId, {
      ...data,
      to: validNumber,
    });
  }

  async sendLocation(
    instanceId: string,
    brokerType: BrokerType,
    data: SendLocationInput
  ): Promise<MessageResult> {
    const provider = this.getProvider(brokerType);
    const messagingProvider = assertCapability<IMessagingCapability>(provider, ProviderCapability.MESSAGING);

    const validNumber = this.validatePhoneNumber(data.to);
    if (!validNumber) {
      throw new Error('Invalid phone number format');
    }

    console.log(`[Orchestrator] Sending location to ${validNumber} via ${brokerType}`);
    return messagingProvider.sendLocation(instanceId, {
      ...data,
      to: validNumber,
    });
  }

  async sendContact(
    instanceId: string,
    brokerType: BrokerType,
    data: SendContactInput
  ): Promise<MessageResult> {
    const provider = this.getProvider(brokerType);
    const messagingProvider = assertCapability<IMessagingCapability>(provider, ProviderCapability.MESSAGING);

    const validNumber = this.validatePhoneNumber(data.to);
    if (!validNumber) {
      throw new Error('Invalid phone number format');
    }

    console.log(`[Orchestrator] Sending contact to ${validNumber} via ${brokerType}`);
    return messagingProvider.sendContact(instanceId, {
      ...data,
      to: validNumber,
    });
  }

  // ===== MENSAGENS INTERATIVAS =====
  async sendInteractiveList(
    instanceId: string,
    brokerType: BrokerType,
    data: SendInteractiveListInput
  ): Promise<MessageResult> {
    const provider = this.getProvider(brokerType);
    const interactiveProvider = assertCapability<IInteractiveCapability>(provider, ProviderCapability.INTERACTIVE);

    const validNumber = this.validatePhoneNumber(data.to);
    if (!validNumber) {
      throw new Error('Invalid phone number format');
    }

    console.log(`[Orchestrator] Sending interactive list to ${validNumber} via ${brokerType}`);
    return interactiveProvider.sendInteractiveList(instanceId, {
      ...data,
      to: validNumber,
    });
  }

  async sendInteractiveButtons(
    instanceId: string,
    brokerType: BrokerType,
    data: SendInteractiveButtonsInput
  ): Promise<MessageResult> {
    const provider = this.getProvider(brokerType);
    const interactiveProvider = assertCapability<IInteractiveCapability>(provider, ProviderCapability.INTERACTIVE);

    const validNumber = this.validatePhoneNumber(data.to);
    if (!validNumber) {
      throw new Error('Invalid phone number format');
    }

    console.log(`[Orchestrator] Sending interactive buttons to ${validNumber} via ${brokerType}`);
    return interactiveProvider.sendInteractiveButtons(instanceId, {
      ...data,
      to: validNumber,
    });
  }

  // ===== AÇÕES DE MENSAGEM =====
  async markAsRead(
    instanceId: string,
    brokerType: BrokerType,
    messageId: string
  ): Promise<void> {
    const provider = this.getProvider(brokerType);
    const messagingProvider = assertCapability<IMessagingCapability>(provider, ProviderCapability.MESSAGING);
    console.log(`[Orchestrator] Marking message ${messageId} as read via ${brokerType}`);
    return messagingProvider.markAsRead(instanceId, messageId);
  }

  async reactToMessage(
    instanceId: string,
    brokerType: BrokerType,
    messageId: string,
    emoji: string
  ): Promise<void> {
    const provider = this.getProvider(brokerType);
    const messagingProvider = assertCapability<IMessagingCapability>(provider, ProviderCapability.MESSAGING);
    console.log(`[Orchestrator] Reacting to message ${messageId} with ${emoji} via ${brokerType}`);
    return messagingProvider.reactToMessage(instanceId, messageId, emoji);
  }

  async deleteMessage(
    instanceId: string,
    brokerType: BrokerType,
    messageId: string
  ): Promise<void> {
    const provider = this.getProvider(brokerType);
    const messagingProvider = assertCapability<IMessagingCapability>(provider, ProviderCapability.MESSAGING);
    console.log(`[Orchestrator] Deleting message ${messageId} via ${brokerType}`);
    return messagingProvider.deleteMessage(instanceId, messageId);
  }

  // ===== PRESENÇA =====
  async sendPresence(
    instanceId: string,
    brokerType: BrokerType,
    to: string,
    type: PresenceType
  ): Promise<void> {
    const provider = this.getProvider(brokerType);
    const messagingProvider = assertCapability<IMessagingCapability>(provider, ProviderCapability.MESSAGING);

    const validNumber = this.validatePhoneNumber(to);
    if (!validNumber) {
      throw new Error('Invalid phone number format');
    }

    console.log(`[Orchestrator] Sending presence ${type} to ${validNumber} via ${brokerType}`);
    return messagingProvider.sendPresence(instanceId, validNumber, type);
  }

  // ===== MÍDIA =====
  async downloadMedia(
    instanceId: string,
    brokerType: BrokerType,
    messageId: string
  ): Promise<MediaDownloadResult> {
    const provider = this.getProvider(brokerType);
    const messagingProvider = assertCapability<IMessagingCapability>(provider, ProviderCapability.MESSAGING);
    console.log(`[Orchestrator] Downloading media for message ${messageId} via ${brokerType}`);
    return messagingProvider.downloadMedia(instanceId, messageId);
  }

  // ===== WEBHOOKS =====
  async configureWebhook(
    instanceId: string,
    brokerType: BrokerType,
    config: WebhookConfig
  ): Promise<WebhookSetupInstructions | void> {
    const provider = this.getProvider(brokerType);
    const webhookProvider = assertCapability<IWebhookCapability>(provider, ProviderCapability.WEBHOOKS);
    console.log(`[Orchestrator] Configuring webhook for ${instanceId} on ${brokerType}`);
    return webhookProvider.configureWebhook(instanceId, config);
  }

  async normalizeWebhook(
    brokerType: BrokerType,
    rawWebhook: any
  ): Promise<NormalizedWebhook> {
    const provider = this.getProvider(brokerType);
    const webhookProvider = assertCapability<IWebhookCapability>(provider, ProviderCapability.WEBHOOKS);
    return webhookProvider.normalizeWebhook(rawWebhook);
  }

  // ===== PROFILE =====
  // Cache de fotos de perfil (5 minutos)
  private profilePicCache: Map<string, { url: string | null; expiresAt: number }> = new Map();
  private readonly PROFILE_PIC_TTL = 5 * 60 * 1000; // 5 minutos

  async getProfilePicture(
    instanceId: string,
    brokerType: BrokerType,
    number: string
  ): Promise<string | null> {
    const cacheKey = `${instanceId}:${number}`;

    // Verificar cache
    const cached = this.profilePicCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    // Buscar do provider
    const provider = this.getProvider(brokerType);
    const profileProvider = assertCapability<IProfileCapability>(provider, ProviderCapability.PROFILE);
    const url = await profileProvider.getProfilePicture(instanceId, number);

    // Salvar no cache
    this.profilePicCache.set(cacheKey, {
      url,
      expiresAt: Date.now() + this.PROFILE_PIC_TTL,
    });

    // Limpar cache antigo periodicamente (a cada 100 entradas)
    if (this.profilePicCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of this.profilePicCache.entries()) {
        if (value.expiresAt < now) {
          this.profilePicCache.delete(key);
        }
      }
    }

    return url;
  }

  async updateProfilePicture(
    instanceId: string,
    brokerType: BrokerType,
    imageUrl: string
  ): Promise<void> {
    const provider = this.getProvider(brokerType);
    const profileProvider = assertCapability<IProfileCapability>(provider, ProviderCapability.PROFILE);
    console.log(`[Orchestrator] Updating profile picture for ${instanceId} on ${brokerType}`);
    return profileProvider.updateProfilePicture(instanceId, imageUrl);
  }

  // ===== PAYMENTS (UAZAPI) =====

  async sendPixButton(
    instanceId: string,
    brokerType: BrokerType,
    input: SendPixButtonInput,
  ): Promise<MessageResult> {
    const provider = this.getProvider(brokerType);
    const paymentProvider = assertCapability<IPaymentCapability>(provider, ProviderCapability.PAYMENTS);
    return paymentProvider.sendPixButton(instanceId, input);
  }

  async sendPaymentRequest(
    instanceId: string,
    brokerType: BrokerType,
    input: SendPaymentRequestInput,
  ): Promise<MessageResult> {
    const provider = this.getProvider(brokerType);
    const paymentProvider = assertCapability<IPaymentCapability>(provider, ProviderCapability.PAYMENTS);
    return paymentProvider.sendPaymentRequest(instanceId, input);
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
    // Se é um grupo (@g.us), retorna como está
    if (number.includes('@g.us')) {
      return number;
    }

    // Se já tem @s.whatsapp.net, extrair apenas o número
    const cleanedInput = number.replace(/@s\.whatsapp\.net$/, '');

    // Remove todos os caracteres não numéricos
    const cleaned = cleanedInput.replace(/\D/g, '');

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
