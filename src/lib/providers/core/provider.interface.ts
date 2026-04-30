/**
 * IWhatsAppProvider - Base Interface
 *
 * Interface base mínima que TODOS os providers devem implementar.
 * Funcionalidades específicas são declaradas via capability interfaces em capabilities.ts.
 *
 * Provider-Agnostic: A API da Quayer funciona igual independente do provider (UAZapi, CloudAPI, Instagram)
 */

import type { ProviderCapability } from './provider.types';

export interface IWhatsAppProvider {
  // ===== IDENTIFICAÇÃO =====
  readonly name: string;
  readonly version: string;

  // ===== CAPABILITIES =====
  /** Lista de capabilities que este provider suporta */
  readonly capabilities: ProviderCapability[];

  // ===== HEALTH =====
  healthCheck(): Promise<boolean>;
}
