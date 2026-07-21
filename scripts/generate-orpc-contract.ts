/**
 * Gera o contrato minificado do router oRPC para consumo do client browser.
 *
 * O OpenAPILink precisa da tabela de rotas (method/path por procedure) em
 * RUNTIME. Importar `appRouter` direto num componente client arrastaria todo
 * o código de servidor (Prisma, repositórios) para o bundle do browser — por
 * isso o contrato é extraído aqui (minifyContractRouter descarta handlers,
 * schemas e middlewares; sobra só { route, meta } por procedure) e gravado em
 * src/orpc/contract.json, que é comitado.
 *
 * Rodar após qualquer mudança de rota nos *.orpc.ts:
 *   npm run orpc:contract
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { minifyContractRouter } from '@orpc/contract'
import { appRouter } from '@/orpc/router'

const contract = minifyContractRouter(appRouter)
const outPath = path.resolve(process.cwd(), 'src/orpc/contract.json')
writeFileSync(outPath, JSON.stringify(contract, null, 2) + '\n')
console.log(`[orpc:contract] contrato gravado em ${outPath}`)
