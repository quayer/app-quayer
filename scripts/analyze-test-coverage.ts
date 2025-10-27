#!/usr/bin/env tsx
/**
 * Script de Análise de Cobertura de Testes
 *
 * Analisa a estrutura de testes e identifica:
 * - Cobertura por tipo (unit, api, e2e)
 * - Componentes/features sem testes
 * - Testes obsoletos ou duplicados
 * - Recomendações de melhoria
 */

import fs from 'fs'
import path from 'path'

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(color: keyof typeof colors, message: string) {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

interface TestFile {
  path: string
  type: 'unit' | 'api' | 'e2e'
  size: number
  name: string
}

interface Component {
  path: string
  name: string
  hasTest: boolean
  type: 'component' | 'page' | 'hook' | 'service' | 'controller'
}

const TEST_DIR = path.join(process.cwd(), 'test')
const SRC_DIR = path.join(process.cwd(), 'src')

const tests: TestFile[] = []
const components: Component[] = []

/**
 * Busca todos os arquivos de teste
 */
function findTests(dir: string, type: 'unit' | 'api' | 'e2e'): void {
  if (!fs.existsSync(dir)) return

  const files = fs.readdirSync(dir)

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      findTests(filePath, type)
    } else if (file.match(/\.(test|spec)\.(ts|tsx)$/)) {
      tests.push({
        path: filePath,
        type,
        size: stat.size,
        name: file,
      })
    }
  }
}

/**
 * Busca componentes, hooks e services
 */
function findComponents(dir: string): void {
  if (!fs.existsSync(dir)) return

  const files = fs.readdirSync(dir)

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      findComponents(filePath)
    } else if (file.match(/\.(tsx|ts)$/) && !file.match(/\.(test|spec)\.(ts|tsx)$/)) {
      let type: Component['type'] = 'component'

      if (filePath.includes('/hooks/')) type = 'hook'
      else if (filePath.includes('/services/')) type = 'service'
      else if (filePath.includes('/controllers/')) type = 'controller'
      else if (filePath.includes('/app/') && file === 'page.tsx') type = 'page'
      else if (file.endsWith('.tsx')) type = 'component'

      const baseName = file.replace(/\.(tsx|ts)$/, '')
      const testPattern = new RegExp(baseName.replace('.', '\\.'))
      const hasTest = tests.some(t => testPattern.test(t.name))

      components.push({
        path: filePath,
        name: file,
        hasTest,
        type,
      })
    }
  }
}

/**
 * Gera estatísticas
 */
function generateStats() {
  const stats = {
    tests: {
      total: tests.length,
      unit: tests.filter(t => t.type === 'unit').length,
      api: tests.filter(t => t.type === 'api').length,
      e2e: tests.filter(t => t.type === 'e2e').length,
      avgSize: Math.round(tests.reduce((acc, t) => acc + t.size, 0) / tests.length / 1024),
    },
    components: {
      total: components.length,
      tested: components.filter(c => c.hasTest).length,
      untested: components.filter(c => !c.hasTest).length,
      byType: {
        component: components.filter(c => c.type === 'component').length,
        page: components.filter(c => c.type === 'page').length,
        hook: components.filter(c => c.type === 'hook').length,
        service: components.filter(c => c.type === 'service').length,
        controller: components.filter(c => c.type === 'controller').length,
      },
    },
  }

  return stats
}

/**
 * Identifica componentes sem testes
 */
function findUntested(): Component[] {
  return components
    .filter(c => !c.hasTest)
    .filter(c => {
      // Excluir arquivos de configuração
      const excludePatterns = [
        'layout.tsx',
        'loading.tsx',
        'error.tsx',
        'not-found.tsx',
        'template.tsx',
        '.config.',
        '.context.',
        '.types.',
        '.interfaces.',
        '.schema.',
      ]

      return !excludePatterns.some(pattern => c.name.includes(pattern))
    })
}

/**
 * Gera relatório em Markdown
 */
function generateMarkdownReport(stats: any, untested: Component[]): string {
  const timestamp = new Date().toISOString().split('T')[0]
  const coveragePercent = Math.round((stats.components.tested / stats.components.total) * 100)

  let md = `# 🧪 Relatório de Cobertura de Testes\n\n`
  md += `**Data**: ${timestamp}\n`
  md += `**Cobertura Estimada**: ${coveragePercent}%\n\n`
  md += `---\n\n`

  // Estatísticas de Testes
  md += `## 📊 Estatísticas de Testes\n\n`
  md += `| Tipo | Quantidade | % |\n`
  md += `|------|------------|---|\n`
  md += `| Unit Tests | ${stats.tests.unit} | ${Math.round((stats.tests.unit / stats.tests.total) * 100)}% |\n`
  md += `| API Tests | ${stats.tests.api} | ${Math.round((stats.tests.api / stats.tests.total) * 100)}% |\n`
  md += `| E2E Tests | ${stats.tests.e2e} | ${Math.round((stats.tests.e2e / stats.tests.total) * 100)}% |\n`
  md += `| **Total** | **${stats.tests.total}** | **100%** |\n\n`
  md += `**Tamanho Médio**: ${stats.tests.avgSize} KB\n\n`

  // Cobertura por Tipo
  md += `## 📈 Cobertura por Tipo de Arquivo\n\n`
  md += `| Tipo | Total | Testados | Sem Teste | Cobertura |\n`
  md += `|------|-------|----------|-----------|----------|\n`

  const types = ['component', 'page', 'hook', 'service', 'controller'] as const
  types.forEach(type => {
    const total = stats.components.byType[type]
    const tested = components.filter(c => c.type === type && c.hasTest).length
    const coverage = total > 0 ? Math.round((tested / total) * 100) : 0
    md += `| ${type} | ${total} | ${tested} | ${total - tested} | ${coverage}% |\n`
  })

  md += `| **Total** | **${stats.components.total}** | **${stats.components.tested}** | **${stats.components.untested}** | **${coveragePercent}%** |\n\n`

  // Componentes sem testes
  if (untested.length > 0) {
    md += `## 🔴 Componentes Sem Testes (${untested.length})\n\n`
    md += `Arquivos que precisam de testes:\n\n`

    const byType = untested.reduce((acc, c) => {
      if (!acc[c.type]) acc[c.type] = []
      acc[c.type].push(c)
      return acc
    }, {} as Record<string, Component[]>)

    Object.entries(byType).forEach(([type, items]) => {
      md += `### ${type} (${items.length})\n\n`
      items.forEach(item => {
        const relativePath = item.path.replace(process.cwd(), '.').replace(/\\/g, '/')
        md += `- \`${relativePath}\`\n`
      })
      md += `\n`
    })
  } else {
    md += `## ✅ Cobertura Completa\n\n`
    md += `Todos os componentes principais têm testes!\n\n`
  }

  // Recomendações
  md += `## 💡 Recomendações\n\n`

  if (coveragePercent < 80) {
    md += `### 🔴 Prioridade ALTA: Aumentar Cobertura\n\n`
    md += `Cobertura atual (${coveragePercent}%) está abaixo da meta (80%).\n\n`
    md += `**Ações**:\n`
    md += `1. Criar testes para componentes críticos primeiro\n`
    md += `2. Focar em hooks e services (lógica de negócio)\n`
    md += `3. Adicionar testes de integração para features principais\n\n`
  } else {
    md += `### ✅ Cobertura Satisfatória\n\n`
    md += `Cobertura atual (${coveragePercent}%) está acima da meta (80%).\n\n`
  }

  if (stats.tests.unit < stats.tests.e2e) {
    md += `### 🟡 Balancear Unit vs E2E\n\n`
    md += `Mais E2E tests (${stats.tests.e2e}) do que Unit tests (${stats.tests.unit}).\n\n`
    md += `**Pirâmide de Testes Ideal**:\n`
    md += `- 70% Unit Tests (lógica isolada)\n`
    md += `- 20% Integration/API Tests\n`
    md += `- 10% E2E Tests (fluxos completos)\n\n`
  }

  md += `### 📚 Melhorias Sugeridas\n\n`
  md += `1. **Componentes UI**: Adicionar testes com Testing Library\n`
  md += `2. **Hooks Customizados**: Testar com @testing-library/react-hooks\n`
  md += `3. **Services**: Mockar APIs e testar lógica de negócio\n`
  md += `4. **Error Boundaries**: Testar cenários de erro\n`
  md += `5. **Acessibilidade**: Adicionar testes a11y com axe-core\n\n`

  return md
}

/**
 * Main
 */
async function main() {
  log('blue', '\n╔════════════════════════════════════════════════════════╗')
  log('blue', '║         ANÁLISE DE COBERTURA DE TESTES                ║')
  log('blue', '╚════════════════════════════════════════════════════════╝\n')

  log('cyan', '📂 Buscando testes...')
  findTests(path.join(TEST_DIR, 'unit'), 'unit')
  findTests(path.join(TEST_DIR, 'api'), 'api')
  findTests(path.join(TEST_DIR, 'e2e'), 'e2e')
  log('green', `✅ ${tests.length} testes encontrados\n`)

  log('cyan', '🔍 Buscando componentes...')
  findComponents(path.join(SRC_DIR, 'components'))
  findComponents(path.join(SRC_DIR, 'app'))
  findComponents(path.join(SRC_DIR, 'hooks'))
  findComponents(path.join(SRC_DIR, 'services'))
  findComponents(path.join(SRC_DIR, 'features'))
  log('green', `✅ ${components.length} componentes encontrados\n`)

  log('cyan', '📊 Gerando estatísticas...')
  const stats = generateStats()
  log('green', '✅ Estatísticas geradas\n')

  log('cyan', '🔍 Identificando componentes sem testes...')
  const untested = findUntested()
  log(untested.length > 0 ? 'yellow' : 'green',
    `${untested.length > 0 ? '⚠️' : '✅'} ${untested.length} componentes sem testes\n`)

  const coveragePercent = Math.round((stats.components.tested / stats.components.total) * 100)

  log('blue', '═════════════════ ESTATÍSTICAS ═════════════════')
  log('cyan', `🧪 Total de Testes:       ${stats.tests.total}`)
  log('cyan', `   - Unit:                ${stats.tests.unit}`)
  log('cyan', `   - API:                 ${stats.tests.api}`)
  log('cyan', `   - E2E:                 ${stats.tests.e2e}`)
  log('cyan', `📦 Total de Componentes:  ${stats.components.total}`)
  log('cyan', `✅ Com Testes:            ${stats.components.tested}`)
  log('cyan', `❌ Sem Testes:            ${stats.components.untested}`)
  log(coveragePercent >= 80 ? 'green' : 'yellow',
    `📈 Cobertura Estimada:    ${coveragePercent}%`)
  log('blue', '═══════════════════════════════════════════════════\n')

  log('cyan', '📝 Gerando relatório...')
  const report = generateMarkdownReport(stats, untested)
  const reportPath = path.join(process.cwd(), 'docs', 'TEST_COVERAGE_REPORT.md')
  fs.writeFileSync(reportPath, report)
  log('green', `✅ Relatório salvo em: ${reportPath}\n`)

  log('blue', '╔════════════════════════════════════════════════════════╗')
  log('blue', '║                  ANÁLISE COMPLETA                      ║')
  log('blue', '╚════════════════════════════════════════════════════════╝\n')

  if (coveragePercent < 80) {
    log('yellow', `⚠️  Cobertura abaixo da meta (80%). Ação necessária!`)
    process.exit(1)
  } else {
    log('green', `✅ Cobertura satisfatória (${coveragePercent}%)!`)
    process.exit(0)
  }
}

main().catch(error => {
  log('red', `\n❌ Erro: ${error.message}`)
  process.exit(1)
})
