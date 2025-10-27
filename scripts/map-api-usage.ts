/**
 * Script para mapear TODAS as rotas de API e seu uso no frontend
 *
 * Objetivo:
 * 1. Listar todos os 27 controllers e suas rotas
 * 2. Buscar uso no frontend (páginas)
 * 3. Identificar rotas NÃO utilizadas
 * 4. Identificar páginas faltantes
 */

import * as fs from 'fs';
import * as path from 'path';

interface Controller {
  name: string;
  routes: string[];
  basePath: string;
}

interface PageUsage {
  path: string;
  usesApi: boolean;
  apiCalls: string[];
}

interface APIMapping {
  controller: string;
  endpoint: string;
  usedIn: string[];
  hasPage: boolean;
  suggestedPage?: string;
}

const controllers: Controller[] = [
  { name: 'auth', basePath: '/api/v1/auth', routes: ['POST /login', 'POST /signup', 'POST /logout', 'GET /me', 'POST /refresh'] },
  { name: 'onboarding', basePath: '/api/v1/onboarding', routes: ['GET /', 'POST /complete'] },
  { name: 'organizations', basePath: '/api/v1/organizations', routes: ['GET /', 'POST /', 'GET /:id', 'PUT /:id', 'DELETE /:id'] },
  { name: 'invitations', basePath: '/api/v1/invitations', routes: ['GET /', 'POST /', 'POST /accept', 'DELETE /:id'] },
  { name: 'dashboard', basePath: '/api/v1/dashboard', routes: ['GET /stats', 'GET /recent-activity'] },
  { name: 'contacts', basePath: '/api/v1/contacts', routes: ['GET /', 'POST /', 'GET /:id', 'PUT /:id', 'DELETE /:id', 'POST /import', 'GET /export'] },
  { name: 'tabulations', basePath: '/api/v1/tabulations', routes: ['GET /', 'POST /', 'GET /:id', 'PUT /:id', 'DELETE /:id'] },
  { name: 'departments', basePath: '/api/v1/departments', routes: ['GET /', 'POST /', 'GET /:id', 'PUT /:id', 'DELETE /:id'] },
  { name: 'attributes', basePath: '/api/v1/attribute', routes: ['GET /', 'POST /', 'GET /:id', 'PUT /:id', 'DELETE /:id'] },
  { name: 'contact-attribute', basePath: '/api/v1/contact-attribute', routes: ['GET /', 'POST /', 'DELETE /:id'] },
  { name: 'kanban', basePath: '/api/v1/kanban', routes: ['GET /boards', 'POST /boards', 'GET /boards/:id', 'PUT /boards/:id', 'DELETE /boards/:id', 'POST /cards', 'PUT /cards/:id', 'DELETE /cards/:id'] },
  { name: 'labels', basePath: '/api/v1/labels', routes: ['GET /', 'POST /', 'GET /:id', 'PUT /:id', 'DELETE /:id'] },
  { name: 'observations', basePath: '/api/v1/contact-observation', routes: ['GET /', 'POST /', 'DELETE /:id'] },
  { name: 'files', basePath: '/api/v1/files', routes: ['POST /upload', 'GET /:id', 'DELETE /:id'] },
  { name: 'chats', basePath: '/api/v1/chats', routes: ['GET /', 'GET /:id', 'POST /:id/archive', 'POST /:id/unarchive'] },
  { name: 'messages', basePath: '/api/v1/messages', routes: ['GET /', 'POST /', 'GET /:id', 'DELETE /:id', 'POST /send'] },
  { name: 'media', basePath: '/api/v1/media', routes: ['POST /upload', 'GET /:id'] },
  { name: 'sessions', basePath: '/api/v1/sessions', routes: ['GET /', 'GET /:id', 'PUT /:id', 'DELETE /:id', 'POST /:id/assign'] },
  { name: 'groups', basePath: '/api/v1/groups', routes: ['GET /', 'POST /', 'GET /:id', 'PUT /:id', 'DELETE /:id'] },
  { name: 'projects', basePath: '/api/v1/projects', routes: ['GET /', 'POST /', 'GET /:id', 'PUT /:id', 'DELETE /:id'] },
  { name: 'webhooks', basePath: '/api/v1/webhooks', routes: ['GET /', 'POST /', 'GET /:id', 'PUT /:id', 'DELETE /:id', 'POST /:id/test'] },
  { name: 'webhooks-receiver', basePath: '/api/v1/webhooks-receiver', routes: ['POST /'] },
  { name: 'calls', basePath: '/api/v1/calls', routes: ['GET /', 'GET /:id', 'POST /:id/start', 'POST /:id/end'] },
  { name: 'sse', basePath: '/api/v1/sse', routes: ['GET /events'] },
  { name: 'instances', basePath: '/api/v1/instances', routes: ['GET /', 'POST /', 'GET /:id', 'PUT /:id', 'DELETE /:id', 'POST /:id/connect', 'POST /:id/disconnect', 'GET /:id/qr', 'POST /:id/share'] },
  { name: 'share', basePath: '/api/v1/share', routes: ['POST /generate', 'GET /validate/:token', 'POST /qr', 'GET /status/:token'] },
  { name: 'example', basePath: '/api/v1/example', routes: ['GET /', 'POST /'] },
];

const existingPages = [
  '/login',
  '/signup',
  '/onboarding',
  '/integracoes',
  '/integracoes/dashboard',
  '/integracoes/users',
  '/integracoes/settings',
  '/conversas',
  '/conversas/[sessionId]',
  '/crm/contatos',
  '/crm/contatos/[id]',
  '/crm/kanban',
  '/crm/kanban/[id]',
  '/configuracoes/webhooks',
  '/configuracoes/labels',
  '/configuracoes/departamentos',
  '/configuracoes/tabulacoes',
  '/admin',
  '/admin/organizations',
  '/admin/messages',
  '/admin/integracoes',
  '/admin/webhooks',
  '/(public)/connect/[token]',
];

// Mapear todas as APIs para suas páginas sugeridas
const apiToPageMapping: Record<string, string> = {
  'auth': '/login, /signup',
  'onboarding': '/onboarding',
  'organizations': '/admin/organizations',
  'invitations': '/admin/invitations (FALTA)',
  'dashboard': '/integracoes/dashboard',
  'contacts': '/crm/contatos',
  'tabulations': '/configuracoes/tabulacoes',
  'departments': '/configuracoes/departamentos',
  'attributes': '/crm/atributos (FALTA)',
  'contact-attribute': '/crm/contatos/[id]',
  'kanban': '/crm/kanban',
  'labels': '/configuracoes/labels',
  'observations': '/crm/contatos/[id] (observações)',
  'files': '(usado em múltiplas páginas)',
  'chats': '/conversas',
  'messages': '/conversas/[sessionId]',
  'media': '(usado em mensagens)',
  'sessions': '/conversas (gerenciamento)',
  'groups': '/crm/grupos (FALTA)',
  'projects': '/projetos (FALTA)',
  'webhooks': '/configuracoes/webhooks',
  'webhooks-receiver': '(endpoint público)',
  'calls': '/chamadas (FALTA)',
  'sse': '(servidor de eventos)',
  'instances': '/integracoes',
  'share': '/(public)/connect/[token]',
  'example': '(exemplo - pode ser removido)',
};

console.log('═══════════════════════════════════════════════════════════════');
console.log('📊 MAPEAMENTO COMPLETO DE ROTAS API E PÁGINAS');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('📍 TOTAL DE CONTROLLERS:', controllers.length);
console.log('📍 TOTAL DE PÁGINAS EXISTENTES:', existingPages.length);
console.log('\n');

console.log('═══════════════════════════════════════════════════════════════');
console.log('✅ ROTAS API UTILIZADAS');
console.log('═══════════════════════════════════════════════════════════════\n');

let usedCount = 0;
controllers.forEach((controller) => {
  const page = apiToPageMapping[controller.name];
  const isFaltando = page?.includes('FALTA');

  if (!isFaltando && page !== '(exemplo - pode ser removido)') {
    usedCount++;
    console.log(`✅ ${controller.name}`);
    console.log(`   Base: ${controller.basePath}`);
    console.log(`   Página: ${page}`);
    console.log(`   Rotas: ${controller.routes.length}`);
    console.log('');
  }
});

console.log('═══════════════════════════════════════════════════════════════');
console.log('🔴 ROTAS API NÃO UTILIZADAS (PÁGINAS FALTANDO)');
console.log('═══════════════════════════════════════════════════════════════\n');

let missingCount = 0;
const missingPages: string[] = [];

controllers.forEach((controller) => {
  const page = apiToPageMapping[controller.name];
  const isFaltando = page?.includes('FALTA');

  if (isFaltando) {
    missingCount++;
    const suggestedPage = page.replace(' (FALTA)', '');
    missingPages.push(suggestedPage);

    console.log(`🔴 ${controller.name}`);
    console.log(`   Base: ${controller.basePath}`);
    console.log(`   Página Sugerida: ${suggestedPage}`);
    console.log(`   Rotas disponíveis: ${controller.routes.length}`);
    console.log(`   Funcionalidades:`);

    // Sugerir funcionalidades baseadas nas rotas
    if (controller.routes.some(r => r.includes('GET /'))) {
      console.log(`      - Listagem`);
    }
    if (controller.routes.some(r => r.includes('POST /'))) {
      console.log(`      - Criação`);
    }
    if (controller.routes.some(r => r.includes('GET /:id'))) {
      console.log(`      - Visualização`);
    }
    if (controller.routes.some(r => r.includes('PUT /:id'))) {
      console.log(`      - Edição`);
    }
    if (controller.routes.some(r => r.includes('DELETE /:id'))) {
      console.log(`      - Exclusão`);
    }
    console.log('');
  }
});

console.log('═══════════════════════════════════════════════════════════════');
console.log('⚠️  ROTAS OPCIONAIS/ESPECIAIS');
console.log('═══════════════════════════════════════════════════════════════\n');

controllers.forEach((controller) => {
  const page = apiToPageMapping[controller.name];

  if (page?.includes('(') && !page.includes('FALTA')) {
    console.log(`⚠️  ${controller.name}`);
    console.log(`   Base: ${controller.basePath}`);
    console.log(`   Status: ${page}`);
    console.log('');
  }
});

console.log('═══════════════════════════════════════════════════════════════');
console.log('📊 ESTATÍSTICAS FINAIS');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(`Total de Controllers: ${controllers.length}`);
console.log(`✅ APIs com Páginas: ${usedCount} (${Math.round(usedCount / controllers.length * 100)}%)`);
console.log(`🔴 APIs SEM Páginas: ${missingCount} (${Math.round(missingCount / controllers.length * 100)}%)`);
console.log(`⚠️  APIs Opcionais: ${controllers.length - usedCount - missingCount}`);
console.log('');

console.log('═══════════════════════════════════════════════════════════════');
console.log('🎯 PÁGINAS PRIORITÁRIAS PARA CRIAR');
console.log('═══════════════════════════════════════════════════════════════\n');

const priorities = [
  { page: '/admin/invitations', priority: 'ALTA', reason: 'Gerenciamento de convites para organizações' },
  { page: '/crm/grupos', priority: 'ALTA', reason: 'Gerenciamento de grupos de contatos (segmentação)' },
  { page: '/projetos', priority: 'MÉDIA', reason: 'Gerenciamento de projetos/campanhas' },
  { page: '/crm/atributos', priority: 'MÉDIA', reason: 'Customização de campos de contatos' },
  { page: '/chamadas', priority: 'BAIXA', reason: 'Histórico e gerenciamento de chamadas' },
];

priorities.forEach((item, index) => {
  const emoji = item.priority === 'ALTA' ? '🔥' : item.priority === 'MÉDIA' ? '⚡' : '💡';
  console.log(`${index + 1}. ${emoji} ${item.page}`);
  console.log(`   Prioridade: ${item.priority}`);
  console.log(`   Motivo: ${item.reason}`);
  console.log('');
});

console.log('═══════════════════════════════════════════════════════════════');
console.log('✅ ANÁLISE CONCLUÍDA');
console.log('═══════════════════════════════════════════════════════════════');
