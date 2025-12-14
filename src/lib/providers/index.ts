/**
 * Providers Module - Public Exports
 *
 * Este módulo exporta o orquestrador e todos os adapters disponíveis
 */

// Core
export * from './core/provider.interface';
export * from './core/provider.types';
export { orchestrator, WhatsAppOrchestrator } from './core/orchestrator';

// Adapters
export { UAZapiAdapter } from './adapters/uazapi/uazapi.adapter';
export { CloudAPIAdapter } from './adapters/cloudapi/cloudapi.adapter';

// ===== INICIALIZAÇÃO DO ORQUESTRADOR =====
import { orchestrator } from './core/orchestrator';
import { UAZapiAdapter } from './adapters/uazapi/uazapi.adapter';
import { CloudAPIAdapter } from './adapters/cloudapi/cloudapi.adapter';

// Registrar UAZapi Adapter automaticamente
if (process.env.UAZAPI_URL && process.env.UAZAPI_ADMIN_TOKEN) {
  const uazapiAdapter = new UAZapiAdapter();
  orchestrator.registerProvider('uazapi', uazapiAdapter);
  console.log('[Providers] UAZapi Adapter registered successfully');
} else {
  console.warn('[Providers] UAZapi credentials not found. UAZapi adapter will not be available.');
}

// Registrar Cloud API Adapter (sempre disponível - tokens são por instância)
const cloudapiAdapter = new CloudAPIAdapter();
orchestrator.registerProvider('cloudapi', cloudapiAdapter);
console.log('[Providers] CloudAPI Adapter registered successfully');

// TODO: Registrar outros adapters quando disponíveis
// if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY) {
//   const evolutionAdapter = new EvolutionAdapter();
//   orchestrator.registerProvider('evolution', evolutionAdapter);
// }
