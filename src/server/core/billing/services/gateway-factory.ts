/**
 * Gateway Factory — resolves the correct PaymentGatewayService and NFS-e service
 * based on the configured gateway mode.
 *
 * Gateway modes:
 *   EFI_ONLY   → Efí for payments, NFS-e disabled (or manual)
 *   ASAAS_ONLY → Asaas for payments + NFS-e
 *   HYBRID     → Efí for payments, Asaas for NFS-e
 *
 * Config: BILLING_GATEWAY_MODE env var (defaults to HYBRID)
 */

import type { PaymentGatewayService, GatewayMode, GatewayProvider } from './gateway.interface';
import { asaasNfseService } from './asaas-nfse.service';

// ── Lazy gateway singletons (avoid eager import warnings for unconfigured gateways) ──

let _efiGateway: PaymentGatewayService | null = null;
let _asaasGateway: PaymentGatewayService | null = null;

function getEfiGateway(): PaymentGatewayService {
  if (!_efiGateway) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { efiGateway } = require('./efi-gateway.service');
    _efiGateway = efiGateway;
  }
  return _efiGateway!;
}

function getAsaasGateway(): PaymentGatewayService {
  if (!_asaasGateway) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { asaasGateway } = require('./asaas-gateway.service');
    _asaasGateway = asaasGateway;
  }
  return _asaasGateway!;
}

export function getGatewayMode(): GatewayMode {
  const mode = (process.env.BILLING_GATEWAY_MODE || 'HYBRID').toUpperCase();
  if (mode === 'EFI_ONLY' || mode === 'ASAAS_ONLY' || mode === 'HYBRID') {
    return mode;
  }
  console.warn(`[GatewayFactory] Invalid BILLING_GATEWAY_MODE: ${mode}, defaulting to HYBRID`);
  return 'HYBRID';
}

/**
 * Returns the payment gateway service for a given provider.
 * If no provider specified, returns the default based on gateway mode.
 */
export function getPaymentGateway(provider?: GatewayProvider): PaymentGatewayService {
  if (provider === 'EFI') return getEfiGateway();
  if (provider === 'ASAAS') return getAsaasGateway();

  const mode = getGatewayMode();
  switch (mode) {
    case 'EFI_ONLY':
    case 'HYBRID':
      return getEfiGateway();
    case 'ASAAS_ONLY':
      return getAsaasGateway();
  }
}

/**
 * Returns the default payment provider based on gateway mode.
 */
export function getDefaultPaymentProvider(): GatewayProvider {
  const mode = getGatewayMode();
  switch (mode) {
    case 'EFI_ONLY':
    case 'HYBRID':
      return 'EFI';
    case 'ASAAS_ONLY':
      return 'ASAAS';
  }
}

/**
 * Returns the NFS-e service if available for the current mode.
 * - EFI_ONLY: returns null (no NFS-e integration)
 * - ASAAS_ONLY / HYBRID: returns Asaas NFS-e service
 */
export function getNfseService() {
  const mode = getGatewayMode();
  if (mode === 'EFI_ONLY') return null;
  return asaasNfseService;
}

/**
 * Returns all available payment providers for the current mode.
 * Used by frontend to show gateway selection options.
 */
export function getAvailableProviders(): GatewayProvider[] {
  const mode = getGatewayMode();
  switch (mode) {
    case 'EFI_ONLY':
      return ['EFI'];
    case 'ASAAS_ONLY':
      return ['ASAAS'];
    case 'HYBRID':
      return ['EFI', 'ASAAS'];
  }
}

/**
 * Whether NFS-e emission is available in the current mode.
 */
export function isNfseAvailable(): boolean {
  return getGatewayMode() !== 'EFI_ONLY';
}
