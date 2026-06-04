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
export { CloudAPIAdapter } from './adapters/cloudapi/cloudapi.adapter';
export { InstagramAdapter } from './adapters/instagram/instagram.adapter';

// ===== INICIALIZAÇÃO DO ORQUESTRADOR =====
import { orchestrator } from './core/orchestrator';
import { CloudAPIAdapter } from './adapters/cloudapi/cloudapi.adapter';
import { InstagramAdapter } from './adapters/instagram/instagram.adapter';

// Registrar Cloud API Adapter (sempre disponível - tokens são por instância)
const cloudapiAdapter = new CloudAPIAdapter();
orchestrator.registerProvider('cloudapi', cloudapiAdapter);
console.log('[Providers] CloudAPI Adapter registered successfully');

// Registrar Instagram Adapter (Direct messaging — credenciais por instância)
const instagramAdapter = new InstagramAdapter();
orchestrator.registerProvider('instagram', instagramAdapter);
console.log('[Providers] Instagram Adapter registered successfully');

// TODO: Registrar outros adapters quando disponíveis
// if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY) {
//   const evolutionAdapter = new EvolutionAdapter();
//   orchestrator.registerProvider('evolution', evolutionAdapter);
// }
