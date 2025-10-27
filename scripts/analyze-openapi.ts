import * as fs from 'fs';

// Ler o arquivo OpenAPI
const openapi = JSON.parse(fs.readFileSync('Default module.openapi.json', 'utf-8'));

interface RouteInfo {
  path: string;
  method: string;
  summary: string;
  tags: string[];
  hasBody: boolean;
  hasParams: boolean;
  bodySchema?: any;
  pathParams?: string[];
}

const routes: RouteInfo[] = [];

// Extrair todas as rotas
for (const [path, pathObj] of Object.entries(openapi.paths || {})) {
  for (const [method, methodObj] of Object.entries(pathObj as any)) {
    if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
      const route: RouteInfo = {
        path,
        method: method.toUpperCase(),
        summary: (methodObj as any).summary || '',
        tags: (methodObj as any).tags || [],
        hasBody: !!(methodObj as any).requestBody,
        hasParams: path.includes('{'),
        bodySchema: (methodObj as any).requestBody?.content?.['application/json']?.schema,
        pathParams: path.match(/\{([^}]+)\}/g)?.map((p: string) => p.slice(1, -1)) || []
      };
      routes.push(route);
    }
  }
}

// Organizar por categoria
const byCategory: Record<string, RouteInfo[]> = {};
routes.forEach(route => {
  const category = route.tags[0] || 'Uncategorized';
  if (!byCategory[category]) byCategory[category] = [];
  byCategory[category].push(route);
});

// Gerar relatório
console.log('📊 ANÁLISE COMPLETA DO OPENAPI FALECOMIGO.AI\n');
console.log(`Total de rotas: ${routes.length}\n`);

console.log('═'.repeat(80));
console.log('RESUMO POR CATEGORIA');
console.log('═'.repeat(80) + '\n');

const categoryStats = Object.entries(byCategory).map(([cat, routes]) => ({
  category: cat,
  count: routes.length
})).sort((a, b) => b.count - a.count);

categoryStats.forEach(({ category, count }) => {
  console.log(`${category.padEnd(30)} ${count.toString().padStart(3)} rotas`);
});

// Salvar relatório completo
const report = {
  totalRoutes: routes.length,
  categories: categoryStats,
  routesByCategory: byCategory,
  allRoutes: routes.map(r => ({
    method: r.method,
    path: r.path,
    summary: r.summary,
    category: r.tags[0] || 'Uncategorized',
    hasBody: r.hasBody,
    pathParams: r.pathParams
  }))
};

fs.writeFileSync('OPENAPI_ANALYSIS.json', JSON.stringify(report, null, 2));
console.log('\n✅ Relatório completo salvo em: OPENAPI_ANALYSIS.json');

// Identificar rotas CRÍTICAS não implementadas
console.log('\n' + '═'.repeat(80));
console.log('🔥 ROTAS CRÍTICAS NÃO IMPLEMENTADAS (PRIORIDADE ALTA)');
console.log('═'.repeat(80) + '\n');

const criticalCategories = [
  'Kanban',
  'Dashboard',
  'Department',
  'ContactAttribute',
  'ContactObservation',
  'Completion/Agents',
  'Label',
  'Files'
];

criticalCategories.forEach(category => {
  const categoryRoutes = byCategory[category] || [];
  if (categoryRoutes.length > 0) {
    console.log(`\n📌 ${category} (${categoryRoutes.length} rotas):`);
    categoryRoutes.forEach(route => {
      console.log(`   ${route.method.padEnd(7)} ${route.path}`);
      if (route.summary) console.log(`           → ${route.summary}`);
    });
  }
});

console.log('\n' + '═'.repeat(80));
