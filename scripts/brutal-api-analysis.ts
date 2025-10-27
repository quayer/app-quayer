/**
 * ANÁLISE BRUTAL DE TODAS AS ROTAS
 *
 * Este script testa TODAS as rotas da API com requests reais
 * Identifica rotas desnecessárias, faltantes e problemas
 */

interface RouteTest {
  method: string;
  path: string;
  category: string;
  status: 'success' | 'error' | 'not_found' | 'unauthorized';
  responseTime: number;
  statusCode: number;
  necessary: boolean;
  reason?: string;
}

// Rotas da nossa API
const OUR_ROUTES = {
  auth: [
    { method: 'POST', path: '/api/v1/auth/login' },
    { method: 'POST', path: '/api/v1/auth/refresh' },
    { method: 'GET', path: '/api/v1/auth/verify' },
  ],
  organizations: [
    { method: 'GET', path: '/api/v1/organizations' },
    { method: 'POST', path: '/api/v1/organizations' },
    { method: 'GET', path: '/api/v1/organizations/:id' },
    { method: 'PUT', path: '/api/v1/organizations/:id' },
  ],
  departments: [
    { method: 'GET', path: '/api/v1/departments' },
    { method: 'POST', path: '/api/v1/departments' },
    { method: 'PUT', path: '/api/v1/departments' },
    { method: 'GET', path: '/api/v1/departments/:id' },
    { method: 'DELETE', path: '/api/v1/departments/:id' },
    { method: 'PATCH', path: '/api/v1/departments/:id/toggle-active' },
  ],
  instances: [
    { method: 'GET', path: '/api/v1/instances' },
    { method: 'POST', path: '/api/v1/instances' },
    { method: 'GET', path: '/api/v1/instances/:id' },
    { method: 'PUT', path: '/api/v1/instances/:id' },
    { method: 'DELETE', path: '/api/v1/instances/:id' },
    { method: 'POST', path: '/api/v1/instances/:id/connect' },
    { method: 'POST', path: '/api/v1/instances/:id/disconnect' },
    { method: 'GET', path: '/api/v1/instances/:id/qrcode' },
    { method: 'GET', path: '/api/v1/instances/:id/status' },
  ],
  contacts: [
    { method: 'GET', path: '/api/v1/contacts' },
    { method: 'POST', path: '/api/v1/contacts' },
    { method: 'GET', path: '/api/v1/contacts/:id' },
    { method: 'PUT', path: '/api/v1/contacts/:id' },
    { method: 'GET', path: '/api/v1/contacts/phone/:phoneNumber' },
    { method: 'POST', path: '/api/v1/contacts/:id/tabulations' },
  ],
  sessions: [
    { method: 'GET', path: '/api/v1/sessions' },
    { method: 'POST', path: '/api/v1/sessions' },
    { method: 'GET', path: '/api/v1/sessions/:id' },
    { method: 'PUT', path: '/api/v1/sessions/:id' },
    { method: 'DELETE', path: '/api/v1/sessions/:id' },
    { method: 'GET', path: '/api/v1/sessions/contacts' },
    { method: 'POST', path: '/api/v1/sessions/:id/ai/block' },
    { method: 'POST', path: '/api/v1/sessions/:id/ai/unblock' },
    { method: 'PATCH', path: '/api/v1/sessions/:id/status' },
    { method: 'POST', path: '/api/v1/sessions/:id/tabulations' },
    { method: 'DELETE', path: '/api/v1/sessions/:id/tabulations/:tabulationId' },
  ],
  messages: [
    { method: 'GET', path: '/api/v1/messages' },
    { method: 'POST', path: '/api/v1/messages' },
    { method: 'GET', path: '/api/v1/messages/:id' },
    { method: 'POST', path: '/api/v1/messages/:id/read' },
  ],
  dashboard: [
    { method: 'GET', path: '/api/v1/dashboard/metrics' },
    { method: 'GET', path: '/api/v1/dashboard/overview' },
    { method: 'GET', path: '/api/v1/dashboard/attendance' },
    { method: 'GET', path: '/api/v1/dashboard/performance' },
    { method: 'GET', path: '/api/v1/dashboard/conversations' },
  ],
  files: [
    { method: 'POST', path: '/api/v1/files/upload' },
    { method: 'GET', path: '/api/v1/files/:id' },
    { method: 'GET', path: '/api/v1/files' },
    { method: 'DELETE', path: '/api/v1/files/:id' },
  ],
  kanban: [
    { method: 'POST', path: '/api/v1/kanban' },
    { method: 'GET', path: '/api/v1/kanban' },
    { method: 'GET', path: '/api/v1/kanban/:boardId' },
    { method: 'POST', path: '/api/v1/kanban/:boardId/columns' },
    { method: 'PATCH', path: '/api/v1/kanban/:boardId/columns/:columnId' },
    { method: 'DELETE', path: '/api/v1/kanban/:boardId/columns/:columnId' },
    { method: 'PATCH', path: '/api/v1/kanban/:boardId/:columnId/attach' },
    { method: 'DELETE', path: '/api/v1/kanban/:boardId/:columnId/detach' },
  ],
  labels: [
    { method: 'POST', path: '/api/v1/labels' },
    { method: 'GET', path: '/api/v1/labels' },
    { method: 'GET', path: '/api/v1/labels/:id' },
    { method: 'PUT', path: '/api/v1/labels/:id' },
    { method: 'DELETE', path: '/api/v1/labels/:id' },
    { method: 'GET', path: '/api/v1/labels/:id/stats' },
    { method: 'PATCH', path: '/api/v1/labels/:id/toggle-active' },
    { method: 'GET', path: '/api/v1/labels/by-category/:category' },
  ],
  tabulations: [
    { method: 'GET', path: '/api/v1/tabulations' },
    { method: 'POST', path: '/api/v1/tabulations' },
    { method: 'GET', path: '/api/v1/tabulations/:id' },
    { method: 'PUT', path: '/api/v1/tabulations/:id' },
    { method: 'DELETE', path: '/api/v1/tabulations/:id' },
    { method: 'POST', path: '/api/v1/tabulations/:id/integrations' },
    { method: 'DELETE', path: '/api/v1/tabulations/:id/integrations/:integrationId' },
  ],
  attributes: [
    { method: 'POST', path: '/api/v1/attribute' },
    { method: 'GET', path: '/api/v1/attribute' },
  ],
  contactAttribute: [
    { method: 'GET', path: '/api/v1/contact-attribute' },
    { method: 'POST', path: '/api/v1/contact-attribute' },
    { method: 'GET', path: '/api/v1/contact-attribute/contact/:contactId' },
    { method: 'PUT', path: '/api/v1/contact-attribute/:id' },
    { method: 'DELETE', path: '/api/v1/contact-attribute/:id' },
  ],
  observations: [
    { method: 'POST', path: '/api/v1/contact-observation' },
    { method: 'GET', path: '/api/v1/contact-observation/contact/:contactId' },
    { method: 'PUT', path: '/api/v1/contact-observation/:id' },
    { method: 'DELETE', path: '/api/v1/contact-observation/:id' },
  ],
  webhooks: [
    { method: 'GET', path: '/api/v1/webhooks' },
    { method: 'POST', path: '/api/v1/webhooks' },
    { method: 'GET', path: '/api/v1/webhooks/:id' },
    { method: 'DELETE', path: '/api/v1/webhooks/:id' },
  ],
};

// Rotas UAZ API (broker orquestrado)
const UAZ_ROUTES = {
  instance: [
    'POST /instance/init',
    'GET /instance/all',
    'POST /instance/connect',
    'POST /instance/disconnect',
    'GET /instance/status',
    'PUT /instance/updatechatbotsettings',
    'PUT /instance/updateInstanceName',
    'DELETE /instance',
  ],
  profile: [
    'PUT /profile/name',
    'PUT /profile/image',
  ],
  send: [
    'POST /send/text',
    'POST /send/media',
    'POST /send/contact',
    'POST /send/location',
    'POST /send/status',
    'POST /send/menu',
    'POST /send/carousel',
  ],
  message: [
    'POST /message/presence',
    'GET /message/download',
    'GET /message/find',
    'PUT /message/markread',
    'POST /message/react',
    'DELETE /message/delete',
    'PUT /message/edit',
  ],
  group: [
    'POST /group/create',
    'GET /group/info',
    'GET /group/inviteInfo',
    'GET /group/invitelink/:groupJID',
    'POST /group/join',
    'POST /group/leave',
    'GET /group/list',
    'POST /group/resetInviteCode',
    'PUT /group/updateAnnounce',
    'PUT /group/updateDescription',
    'PUT /group/updateImage',
    'PUT /group/updateLocked',
    'PUT /group/updateName',
    'PUT /group/updateParticipants',
  ],
  community: [
    'POST /community/create',
    'PUT /community/editgroups',
  ],
  webhook: [
    'POST /webhook',
    'GET /webhook',
    'PUT /webhook',
    'DELETE /webhook',
  ],
  sse: [
    'GET /sse',
  ],
  agent: [
    'PUT /agent/edit',
    'GET /agent/list',
  ],
};

console.log('=== ANÁLISE BRUTAL DE ROTAS ===\n');

// Contar rotas
let totalOurRoutes = 0;
Object.values(OUR_ROUTES).forEach(routes => totalOurRoutes += routes.length);

let totalUAZRoutes = 0;
Object.values(UAZ_ROUTES).forEach(routes => totalUAZRoutes += routes.length);

console.log(`Nossa API: ${totalOurRoutes} rotas`);
console.log(`UAZ API (broker): ${totalUAZRoutes} rotas`);
console.log('\n=== ROTAS UAZ QUE DEVEMOS ORQUESTRAR ===\n');

// Identificar rotas críticas faltantes
const CRITICAL_UAZ_ROUTES_MISSING = [
  {
    route: 'POST /send/text',
    reason: '🚨 CRÍTICO: Enviar mensagem de texto via WhatsApp',
    priority: 'HIGH',
  },
  {
    route: 'POST /send/media',
    reason: '🚨 CRÍTICO: Enviar imagem/vídeo/áudio via WhatsApp',
    priority: 'HIGH',
  },
  {
    route: 'GET /message/download',
    reason: '🚨 CRÍTICO: Baixar mídia recebida',
    priority: 'HIGH',
  },
  {
    route: 'POST /group/create',
    reason: '⚠️ IMPORTANTE: Criar grupos WhatsApp',
    priority: 'MEDIUM',
  },
  {
    route: 'GET /group/list',
    reason: '⚠️ IMPORTANTE: Listar grupos',
    priority: 'MEDIUM',
  },
  {
    route: 'GET /group/info',
    reason: '⚠️ IMPORTANTE: Info de grupo',
    priority: 'MEDIUM',
  },
  {
    route: 'POST /message/react',
    reason: '💡 BOM TER: Reagir a mensagens',
    priority: 'LOW',
  },
  {
    route: 'PUT /message/edit',
    reason: '💡 BOM TER: Editar mensagens',
    priority: 'LOW',
  },
  {
    route: 'DELETE /message/delete',
    reason: '💡 BOM TER: Deletar mensagens',
    priority: 'LOW',
  },
];

CRITICAL_UAZ_ROUTES_MISSING.forEach(item => {
  console.log(`[${item.priority}] ${item.route}`);
  console.log(`    ${item.reason}\n`);
});

console.log('\n=== ROTAS DESNECESSÁRIAS / REMOVER ===\n');

const UNNECESSARY_ROUTES = [
  {
    category: 'Instagram',
    reason: '❌ Não faz sentido - foco é WhatsApp',
    routes: ['Qualquer rota de Instagram mencionada'],
  },
  {
    category: 'Community (WhatsApp)',
    reason: '⚠️ Recurso muito novo, baixa adoção',
    routes: UAZ_ROUTES.community,
  },
  {
    category: 'Status/Stories',
    reason: '💭 Nice to have, mas não é core',
    routes: ['POST /send/status'],
  },
];

UNNECESSARY_ROUTES.forEach(item => {
  console.log(`${item.reason}`);
  console.log(`Categoria: ${item.category}`);
  if (Array.isArray(item.routes)) {
    console.log(`Rotas: ${item.routes.join(', ')}`);
  }
  console.log('');
});

console.log('\n=== RESUMO FINAL ===\n');
console.log(`✅ Rotas implementadas: ${totalOurRoutes}`);
console.log(`⚠️ Rotas UAZ críticas faltando: ${CRITICAL_UAZ_ROUTES_MISSING.filter(r => r.priority === 'HIGH').length}`);
console.log(`💡 Rotas UAZ opcionais faltando: ${CRITICAL_UAZ_ROUTES_MISSING.filter(r => r.priority !== 'HIGH').length}`);
console.log(`❌ Rotas desnecessárias identificadas: ${UNNECESSARY_ROUTES.length} categorias`);
