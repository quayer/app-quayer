/**
 * Capability Helpers — Runtime Type Guards & Utilities
 *
 * Helpers para verificar e acessar capabilities de providers em runtime com type safety.
 */

import type { IWhatsAppProvider } from './provider.interface';
import { ProviderCapability } from './provider.types';
import type {
  IInstanceCapability,
  IMessagingCapability,
  IInteractiveCapability,
  IWebhookCapability,
  IProfileCapability,
  ITemplateCapability,
  IFlowCapability,
  IBusinessCapability,
  ICatalogCapability,
  IChatActionsCapability,
  ILabelCapability,
  IContactCapability,
  ICampaignCapability,
  ICallCapability,
  IAnalyticsCapability,
  IGroupCapability,
  IMediaManagementCapability,
  IPaymentCapability,
} from './capabilities';

// ===== ERROR =====

export class ProviderCapabilityError extends Error {
  constructor(
    public readonly capability: ProviderCapability,
    public readonly providerName: string,
  ) {
    super(
      `Provider "${providerName}" does not support capability "${capability}". ` +
      `Available capabilities: use provider.capabilities to check.`
    );
    this.name = 'ProviderCapabilityError';
  }
}

// ===== CORE HELPERS =====

/**
 * Check if a provider supports a given capability
 */
export function hasCapability(
  provider: IWhatsAppProvider,
  capability: ProviderCapability,
): boolean {
  return provider.capabilities.includes(capability);
}

/**
 * Get a capability interface from a provider, or null if not supported
 */
export function getCapability<T>(
  provider: IWhatsAppProvider,
  capability: ProviderCapability,
): T | null {
  if (!hasCapability(provider, capability)) {
    return null;
  }
  return provider as unknown as T;
}

/**
 * Get a capability interface from a provider, or throw ProviderCapabilityError
 */
export function assertCapability<T>(
  provider: IWhatsAppProvider,
  capability: ProviderCapability,
): T {
  if (!hasCapability(provider, capability)) {
    throw new ProviderCapabilityError(capability, provider.name);
  }
  return provider as unknown as T;
}

// ===== CAPABILITY → INTERFACE MAPPING =====

/** Maps each ProviderCapability to its TypeScript interface */
export type CapabilityInterfaceMap = {
  [ProviderCapability.MESSAGING]: IMessagingCapability;
  [ProviderCapability.INTERACTIVE]: IInteractiveCapability;
  [ProviderCapability.TEMPLATES]: ITemplateCapability;
  [ProviderCapability.FLOWS]: IFlowCapability;
  [ProviderCapability.BUSINESS_PROFILE]: IBusinessCapability;
  [ProviderCapability.CATALOG]: ICatalogCapability;
  [ProviderCapability.MEDIA_MANAGEMENT]: IMediaManagementCapability;
  [ProviderCapability.CHAT_ACTIONS]: IChatActionsCapability;
  [ProviderCapability.LABELS]: ILabelCapability;
  [ProviderCapability.CAMPAIGNS]: ICampaignCapability;
  [ProviderCapability.CALLS]: ICallCapability;
  [ProviderCapability.ANALYTICS]: IAnalyticsCapability;
  [ProviderCapability.GROUPS]: IGroupCapability;
  [ProviderCapability.CONTACTS]: IContactCapability;
  [ProviderCapability.WEBHOOKS]: IWebhookCapability;
  [ProviderCapability.INSTANCE_MANAGEMENT]: IInstanceCapability;
  [ProviderCapability.PAYMENTS]: IPaymentCapability;
  [ProviderCapability.PROFILE]: IProfileCapability;
};

// ===== TYPE GUARDS =====

export function isMessagingProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & IMessagingCapability {
  return hasCapability(provider, ProviderCapability.MESSAGING);
}

export function isInteractiveProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & IInteractiveCapability {
  return hasCapability(provider, ProviderCapability.INTERACTIVE);
}

export function isTemplateProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & ITemplateCapability {
  return hasCapability(provider, ProviderCapability.TEMPLATES);
}

export function isFlowProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & IFlowCapability {
  return hasCapability(provider, ProviderCapability.FLOWS);
}

export function isBusinessProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & IBusinessCapability {
  return hasCapability(provider, ProviderCapability.BUSINESS_PROFILE);
}

export function isCatalogProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & ICatalogCapability {
  return hasCapability(provider, ProviderCapability.CATALOG);
}

export function isMediaManagementProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & IMediaManagementCapability {
  return hasCapability(provider, ProviderCapability.MEDIA_MANAGEMENT);
}

export function isChatActionsProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & IChatActionsCapability {
  return hasCapability(provider, ProviderCapability.CHAT_ACTIONS);
}

export function isLabelProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & ILabelCapability {
  return hasCapability(provider, ProviderCapability.LABELS);
}

export function isCampaignProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & ICampaignCapability {
  return hasCapability(provider, ProviderCapability.CAMPAIGNS);
}

export function isCallProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & ICallCapability {
  return hasCapability(provider, ProviderCapability.CALLS);
}

export function isAnalyticsProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & IAnalyticsCapability {
  return hasCapability(provider, ProviderCapability.ANALYTICS);
}

export function isGroupProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & IGroupCapability {
  return hasCapability(provider, ProviderCapability.GROUPS);
}

export function isContactProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & IContactCapability {
  return hasCapability(provider, ProviderCapability.CONTACTS);
}

export function isWebhookProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & IWebhookCapability {
  return hasCapability(provider, ProviderCapability.WEBHOOKS);
}

export function isInstanceProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & IInstanceCapability {
  return hasCapability(provider, ProviderCapability.INSTANCE_MANAGEMENT);
}

export function isPaymentProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & IPaymentCapability {
  return hasCapability(provider, ProviderCapability.PAYMENTS);
}

export function isProfileProvider(
  provider: IWhatsAppProvider,
): provider is IWhatsAppProvider & IProfileCapability {
  return hasCapability(provider, ProviderCapability.PROFILE);
}
