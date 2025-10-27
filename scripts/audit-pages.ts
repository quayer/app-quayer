#!/usr/bin/env tsx
/**
 * Script de Auditoria de Páginas
 *
 * Analisa todas as páginas em src/app/ e identifica:
 * - Páginas duplicadas
 * - Páginas obsoletas
 * - Rotas conflitantes
 * - Páginas não utilizadas
 *
 * Usage: npx tsx scripts/audit-pages.ts
 */

import fs from 'fs'
import path from 'path'

interface PageInfo {
  path: string
  route: string
  size: number
  lastModified: Date
  imports: string[]
  exports: string[]
  hasServerComponent: boolean
  hasClientComponent: boolean
  hasLayout: boolean
}

const APP_DIR = path.join(process.cwd(), 'src', 'app')
const pages: PageInfo[] = []
const layouts: string[] = []
const duplicateRoutes: Map<string, string[]> = new Map()

// Cores para output
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

/**
 * Extrai o nome da rota do caminho do arquivo
 */
function extractRoute(filePath: string): string {
  let route = filePath
    .replace(APP_DIR, '')
    .replace(/\\/g, '/')
    .replace(/\/page\.(tsx|ts|jsx|js)$/, '')
    .replace(/\/layout\.(tsx|ts|jsx|js)$/, '')

  // Remove grupos de rota (auth), (dashboard), etc
  route = route.replace(/\/\([^)]+\)/g, '')

  // Remove parâmetros dinâmicos
  route = route.replace(/\/\[([^\]]+)\]/g, '/:$1')

  return route || '/'
}

/**
 * Analisa o conteúdo do arquivo
 */
function analyzeFile(filePath: string): Partial<PageInfo> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const stats = fs.statSync(filePath)

  const imports = content.match(/import .+ from ['"](.+)['"]/g) || []
  const exports = content.match(/export (default|const|function|class) \w+/g) || []

  return {
    size: stats.size,
    lastModified: stats.mtime,
    imports: imports.map(i => i.replace(/import .+ from ['"](.+)['"]/, '$1')),
    exports: exports.map(e => e.replace(/export (default|const|function|class) /, '')),
    hasServerComponent: !content.includes("'use client'") && !content.includes('"use client"'),
    hasClientComponent: content.includes("'use client'") || content.includes('"use client"'),
  }
}

/**
 * Busca recursivamente por arquivos page.tsx
 */
function findPages(dir: string): void {
  const files = fs.readdirSync(dir)

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      findPages(filePath)
    } else if (file.match(/^page\.(tsx|ts|jsx|js)$/)) {
      const route = extractRoute(filePath)
      const analysis = analyzeFile(filePath)

      pages.push({
        path: filePath,
        route,
        ...analysis,
        hasLayout: layouts.includes(path.dirname(filePath)),
      } as PageInfo)

      // Detectar rotas duplicadas
      if (!duplicateRoutes.has(route)) {
        duplicateRoutes.set(route, [])
      }
      duplicateRoutes.get(route)!.push(filePath)
    } else if (file.match(/^layout\.(tsx|ts|jsx|js)$/)) {
      layouts.push(path.dirname(filePath))
    }
  }
}

/**
 * Identifica páginas duplicadas
 */
function findDuplicates(): Array<{ route: string; files: string[] }> {
  const duplicates: Array<{ route: string; files: string[] }> = []

  duplicateRoutes.forEach((files, route) => {
    if (files.length > 1) {
      duplicates.push({ route, files })
    }
  })

  return duplicates
}

/**
 * Identifica páginas potencialmente obsoletas
 */
function findObsolete(): PageInfo[] {
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

  return pages.filter(page => {
    // Páginas antigas e pequenas (< 2KB) são suspeitas
    const isOld = page.lastModified < threeMonthsAgo
    const isSmall = page.size < 2000
    const hasMinimalExports = page.exports.length <= 1

    return isOld && isSmall && hasMinimalExports
  })
}

/**
 * Gera estatísticas
 */
function generateStats() {
  const stats = {
    total: pages.length,
    serverComponents: pages.filter(p => p.hasServerComponent).length,
    clientComponents: pages.filter(p => p.hasClientComponent).length,
    withLayout: pages.filter(p => p.hasLayout).length,
    avgSize: Math.round(pages.reduce((acc, p) => acc + p.size, 0) / pages.length),
    totalLayouts: layouts.length,
  }

  return stats
}

/**
 * Gera relatório em Markdown
 */
function generateMarkdownReport(
  duplicates: Array<{ route: string; files: string[] }>,
  obsolete: PageInfo[],
  stats: any
): string {
  const timestamp = new Date().toISOString().split('T')[0]

  let md = `# 📊 Relatório de Auditoria de Páginas\n\n`
  md += `**Data**: ${timestamp}\n`
  md += `**Total de Páginas**: ${stats.total}\n\n`
  md += `---\n\n`

  // Estatísticas
  md += `## 📈 Estatísticas Gerais\n\n`
  md += `| Métrica | Valor |\n`
  md += `|---------|-------|\n`
  md += `| Total de Páginas | ${stats.total} |\n`
  md += `| Server Components | ${stats.serverComponents} (${Math.round((stats.serverComponents / stats.total) * 100)}%) |\n`
  md += `| Client Components | ${stats.clientComponents} (${Math.round((stats.clientComponents / stats.total) * 100)}%) |\n`
  md += `| Com Layout Próprio | ${stats.withLayout} |\n`
  md += `| Total de Layouts | ${stats.totalLayouts} |\n`
  md += `| Tamanho Médio | ${(stats.avgSize / 1024).toFixed(2)} KB |\n\n`

  // Duplicadas
  if (duplicates.length > 0) {
    md += `## 🔴 Rotas Duplicadas (${duplicates.length})\n\n`
    md += `⚠️ **ATENÇÃO**: As seguintes rotas têm múltiplas implementações:\n\n`

    duplicates.forEach(({ route, files }) => {
      md += `### Rota: \`${route}\`\n\n`
      files.forEach(file => {
        const relativePath = file.replace(process.cwd(), '.')
        md += `- \`${relativePath}\`\n`
      })
      md += `\n**Ação Recomendada**: Consolidar em um único arquivo ou verificar se são propositalmente diferentes.\n\n`
    })
  } else {
    md += `## ✅ Rotas Duplicadas\n\n`
    md += `Nenhuma rota duplicada encontrada.\n\n`
  }

  // Obsoletas
  if (obsolete.length > 0) {
    md += `## 🟡 Páginas Potencialmente Obsoletas (${obsolete.length})\n\n`
    md += `Páginas antigas (>3 meses), pequenas (<2KB) e com poucos exports:\n\n`
    md += `| Rota | Arquivo | Tamanho | Última Modificação |\n`
    md += `|------|---------|---------|-------------------|\n`

    obsolete.forEach(page => {
      const relativePath = page.path.replace(process.cwd(), '.')
      const dateStr = page.lastModified.toISOString().split('T')[0]
      md += `| \`${page.route}\` | \`${relativePath}\` | ${(page.size / 1024).toFixed(2)} KB | ${dateStr} |\n`
    })

    md += `\n**Ação Recomendada**: Revisar e deletar se não for mais necessária.\n\n`
  } else {
    md += `## ✅ Páginas Obsoletas\n\n`
    md += `Nenhuma página obsoleta detectada.\n\n`
  }

  // Lista completa de rotas
  md += `## 📋 Lista Completa de Rotas (${pages.length})\n\n`
  md += `| Rota | Tipo | Tamanho | Arquivo |\n`
  md += `|------|------|---------|--------|\n`

  pages
    .sort((a, b) => a.route.localeCompare(b.route))
    .forEach(page => {
      const type = page.hasClientComponent ? '🔵 Client' : '🟢 Server'
      const relativePath = page.path.replace(process.cwd(), '.').replace(/\\/g, '/')
      md += `| \`${page.route}\` | ${type} | ${(page.size / 1024).toFixed(2)} KB | \`${relativePath}\` |\n`
    })

  return md
}

/**
 * Main
 */
async function main() {
  log('blue', '\n╔════════════════════════════════════════════════════════╗')
  log('blue', '║         AUDITORIA DE PÁGINAS - QUAYER APP             ║')
  log('blue', '╚════════════════════════════════════════════════════════╝\n')

  log('cyan', '📂 Buscando páginas em src/app/...')
  findPages(APP_DIR)
  log('green', `✅ ${pages.length} páginas encontradas\n`)

  log('cyan', '🔍 Analisando duplicatas...')
  const duplicates = findDuplicates()
  if (duplicates.length > 0) {
    log('red', `❌ ${duplicates.length} rotas duplicadas encontradas`)
    duplicates.forEach(({ route, files }) => {
      log('yellow', `\n   Rota: ${route}`)
      files.forEach(file => log('yellow', `   - ${file.replace(APP_DIR, 'src/app')}`))
    })
  } else {
    log('green', '✅ Nenhuma duplicata encontrada')
  }
  console.log()

  log('cyan', '🗑️  Procurando páginas obsoletas...')
  const obsolete = findObsolete()
  if (obsolete.length > 0) {
    log('yellow', `⚠️  ${obsolete.length} páginas potencialmente obsoletas`)
  } else {
    log('green', '✅ Nenhuma página obsoleta detectada')
  }
  console.log()

  log('cyan', '📊 Gerando estatísticas...')
  const stats = generateStats()
  log('green', `✅ Estatísticas geradas\n`)

  log('blue', '═════════════════ ESTATÍSTICAS ═════════════════')
  log('cyan', `📄 Total de Páginas:      ${stats.total}`)
  log('cyan', `🟢 Server Components:     ${stats.serverComponents}`)
  log('cyan', `🔵 Client Components:     ${stats.clientComponents}`)
  log('cyan', `📐 Layouts:               ${stats.totalLayouts}`)
  log('cyan', `📏 Tamanho Médio:         ${(stats.avgSize / 1024).toFixed(2)} KB`)
  log('blue', '═══════════════════════════════════════════════════\n')

  log('cyan', '📝 Gerando relatório em Markdown...')
  const report = generateMarkdownReport(duplicates, obsolete, stats)
  const reportPath = path.join(process.cwd(), 'docs', 'PAGES_AUDIT_REPORT.md')
  fs.writeFileSync(reportPath, report)
  log('green', `✅ Relatório salvo em: ${reportPath}\n`)

  log('blue', '╔════════════════════════════════════════════════════════╗')
  log('blue', '║                    AUDITORIA COMPLETA                  ║')
  log('blue', '╚════════════════════════════════════════════════════════╝\n')

  // Exit code baseado em problemas encontrados
  if (duplicates.length > 0 || obsolete.length > 0) {
    log('yellow', '⚠️  Problemas encontrados - Revise o relatório')
    process.exit(1)
  } else {
    log('green', '✅ Nenhum problema encontrado!')
    process.exit(0)
  }
}

main().catch(error => {
  log('red', `\n❌ Erro: ${error.message}`)
  process.exit(1)
})
