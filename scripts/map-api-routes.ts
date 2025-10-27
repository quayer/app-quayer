/**
 * Script para mapear todas as rotas de API disponíveis
 *
 * Analisa todos os controllers e extrai as rotas definidas
 */

import fs from 'fs';
import path from 'path';

interface Route {
  method: string;
  path: string;
  controller: string;
  action: string;
  file: string;
}

const routes: Route[] = [];

function extractRoutesFromFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  // Extract controller name from content
  const controllerMatch = content.match(/export const (\w+Controller)/);
  const controllerName = controllerMatch ? controllerMatch[1] : path.basename(filePath, '.controller.ts');

  // Match patterns like:
  // list: query(z.object({...}), async () => {...})
  // create: mutation(z.object({...}), async () => {...})
  const actionRegex = /(\w+):\s*(query|mutation)\(/g;
  let match;

  while ((match = actionRegex.exec(content)) !== null) {
    const actionName = match[1];
    const type = match[2];
    const method = type === 'query' ? 'GET' : 'POST';

    // Infer path from controller name and action
    const basePath = controllerName
      .replace('Controller', '')
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');

    routes.push({
      method,
      path: `/api/v1/${basePath}/${actionName}`,
      controller: controllerName,
      action: actionName,
      file: filePath.replace(/\\/g, '/').replace(process.cwd().replace(/\\/g, '/') + '/', ''),
    });
  }
}

// Find all controller files
function findControllers(dir: string): string[] {
  const controllers: string[] = [];

  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory()) {
      controllers.push(...findControllers(fullPath));
    } else if (file.name.endsWith('.controller.ts')) {
      controllers.push(fullPath);
    }
  }

  return controllers;
}

console.log('🔍 Mapeando rotas de API...\n');

const featuresDir = path.join(process.cwd(), 'src', 'features');
const controllerFiles = findControllers(featuresDir);

console.log(`📁 Encontrados ${controllerFiles.length} controllers\n`);

for (const file of controllerFiles) {
  extractRoutesFromFile(file);
}

// Group by controller
const byController: Record<string, Route[]> = {};
for (const route of routes) {
  if (!byController[route.controller]) {
    byController[route.controller] = [];
  }
  byController[route.controller].push(route);
}

// Print results
console.log('📊 ROTAS MAPEADAS POR CONTROLLER\n');
console.log('='.repeat(80));

for (const [controller, controllerRoutes] of Object.entries(byController)) {
  console.log(`\n🎯 ${controller}`);
  console.log('─'.repeat(80));

  for (const route of controllerRoutes) {
    console.log(`  ${route.method.padEnd(6)} ${route.path}`);
  }
}

console.log('\n' + '='.repeat(80));
console.log(`\n✅ Total: ${routes.length} rotas mapeadas\n`);

// Export to JSON
const outputPath = path.join(process.cwd(), 'API_ROUTES_MAP.json');
fs.writeFileSync(outputPath, JSON.stringify({
  total: routes.length,
  controllers: Object.keys(byController).length,
  routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
  byController,
}, null, 2));

console.log(`📄 Mapa completo salvo em: API_ROUTES_MAP.json\n`);
