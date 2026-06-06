/**
 * build-workers — bundler do entrypoint dos workers BullMQ p/ a imagem de prod.
 *
 * PROBLEMA QUE RESOLVE:
 *   `scripts/start-workers.ts` roda em dev via `tsx`, mas a imagem de produção
 *   é um build Next `output: 'standalone'`: o runner copia SÓ
 *   .next/standalone + .next/static + public + prisma client + pg. NÃO tem
 *   `src/`, NÃO tem `tsx`, NÃO tem devDependencies. Logo `tsx scripts/start-workers.ts`
 *   é impossível em prod e os workers (outbound-retry / source-enrich /
 *   session-close) nunca subiriam → filas enfileiram e ninguém consome.
 *
 * SOLUÇÃO:
 *   esbuild empacota o entrypoint + TODO o caminho de envio (jobs/index →
 *   filas → outbound.service lazy → uazapi-sender → database → redis) num ÚNICO
 *   .js CJS, resolvendo os aliases `@/*` → `src/*` em build-time. O bundle vai
 *   para `.next/standalone/workers/start-workers.js` (ao lado do server.js do
 *   Next) e o Dockerfile copia essa pasta para o runner. O worker roda com
 *   `node workers/start-workers.js` — sem tsx, sem src/, sem devDeps.
 *
 * EXTERNALS (NÃO empacotar — devem existir no node_modules do runner):
 *   - @prisma/client + .prisma/client → client nativo/gerado JÁ copiado para o
 *     runner (Dockerfile linhas ~128-129). Empacotar quebra o client gerado.
 *   - pg → instalado fresh no runner (Dockerfile linha ~162) p/ resolver a
 *     árvore transitiva nativa corretamente.
 *   - bullmq / ioredis / redis / @igniter-js/* / @sentry/node → puro JS, mas o
 *     trace do standalone JÁ os inclui em .next/standalone/node_modules (o app
 *     os importa). Externalizar mantém o bundle pequeno e evita duplicar libs
 *     que esperam ser singletons (conexões Redis).
 *
 * Uso:  node scripts/build-workers.mjs   (= npm run build:workers)
 * Roda no estágio `builder` do Dockerfile, DEPOIS do `next build` (que produz
 * .next/standalone), para o output cair dentro de standalone/workers.
 */

import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { existsSync, statSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const srcDir = join(projectRoot, 'src')

const entry = join(projectRoot, 'scripts', 'start-workers.ts')
const outfile = join(projectRoot, '.next', 'standalone', 'workers', 'start-workers.js')

/**
 * Pacotes mantidos como `require()` no bundle (não empacotados). Devem existir
 * no node_modules do runner — ver comentário do cabeçalho. @next/env NÃO está
 * aqui de propósito: é puro JS e leve, então o empacotamos (evita depender de
 * sua presença no runner).
 */
const externals = [
  '@prisma/client',
  '@prisma/adapter-pg',
  'bullmq',
  'ioredis',
  'redis',
  '@igniter-js/core',
  '@igniter-js/adapter-bullmq',
  '@igniter-js/adapter-redis',
  '@sentry/node',
  'pg',
]

/**
 * Plugin inline: resolve os aliases `@/*` do tsconfig (`@/* -> ./src/*`) em
 * build-time. Mais robusto que um plugin de terceiros — sem dependência extra,
 * resolve com a mesma ordem de extensões do tsc (.ts/.tsx/.js/index.*).
 */
const tsconfigAliasPlugin = {
  name: 'tsconfig-paths-alias',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^@\// }, (args) => {
      const rel = args.path.slice(2) // tira o "@/"
      const base = join(srcDir, rel)
      // Ordem de resolução igual à do tsc/Next: extensão direta primeiro, depois
      // o index/* da pasta. `base` puro NÃO entra como candidato de arquivo —
      // se for uma pasta (ex.: `@/server/services/jobs`), esbuild tentaria
      // lê-la como arquivo e falha; resolvemos via o `index.*` da pasta.
      const isFile = (p) => existsSync(p) && statSync(p).isFile()
      const candidates = [
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.mjs`,
        join(base, 'index.ts'),
        join(base, 'index.tsx'),
        join(base, 'index.js'),
      ]
      // Caso `base` já seja um arquivo (alias apontando direto p/ um .ts sem ext).
      if (isFile(base)) return { path: base }
      const found = candidates.find((c) => isFile(c))
      if (found) return { path: found }
      // Deixa o esbuild reportar o erro de resolução com contexto do arquivo.
      return undefined
    })
  },
}

async function main() {
  const result = await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22', // runner é node:22-alpine
    // O entry chama process.exit/SIGTERM — main bundle, sem tree-shaking agressivo.
    minify: false,
    sourcemap: false,
    external: externals,
    plugins: [tsconfigAliasPlugin],
    // Resolve .ts sem precisar de tsconfig explícito (esbuild faz transpile).
    resolveExtensions: ['.ts', '.tsx', '.mjs', '.js', '.json'],
    logLevel: 'info',
    metafile: true,
    // Banner: o bundle é CJS; nada a injetar. Mantido vazio p/ clareza.
  })

  // Sumário leve do tamanho do bundle (risco monitorado: manter < ~10MB).
  const out = result.metafile?.outputs?.[
    Object.keys(result.metafile.outputs).find((k) => k.endsWith('start-workers.js')) ?? ''
  ]
  if (out) {
    const kb = (out.bytes / 1024).toFixed(1)
    console.info(`[build-workers] bundle gerado: ${outfile} (${kb} KB)`)
  } else {
    console.info(`[build-workers] bundle gerado: ${outfile}`)
  }
}

main().catch((err) => {
  console.error('[build-workers] falhou:', err)
  process.exit(1)
})
