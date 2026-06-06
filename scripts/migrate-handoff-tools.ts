/**
 * Migração de enabledTools para o handoff UNIFICADO (Fase 2).
 *
 * Contexto: as tools notify_team e dispatch_to_agent foram consolidadas em
 * transfer_to_human (routing queue|department|self). Elas ainda existem como
 * ALIASES deprecated, então NADA quebra hoje. Esta migração PREPARA a remoção
 * dos aliases: garante que todo agente que dependia de notify_team/dispatch_to_agent
 * passe a ter transfer_to_human no enabledTools.
 *
 * Alvo: AIAgentConfig.enabledTools (o que o runtime lê em getEnabledBuiltinTools).
 * NÃO toca AgentRuntimeDecision.enabledTools (isso é log de auditoria, não config).
 *
 * SEGURO POR PADRÃO: roda em DRY-RUN (só mostra o que faria). Para aplicar de
 * verdade, passe --apply. Para também REMOVER os nomes de alias do array (fazer
 * SÓ depois que os aliases forem removidos do código — Fase 2 final), passe
 * --drop-aliases. Idempotente: rodar de novo é no-op.
 *
 * Run:
 *   npx tsx scripts/migrate-handoff-tools.ts                 # dry-run
 *   npx tsx scripts/migrate-handoff-tools.ts --apply         # adiciona transfer_to_human
 *   npx tsx scripts/migrate-handoff-tools.ts --apply --drop-aliases
 */

import 'dotenv/config'
import { database } from '../src/server/services/database'

const ALIASES = ['notify_team', 'dispatch_to_agent'] as const
const CANONICAL = 'transfer_to_human'

/**
 * Núcleo PURO e idempotente: dado o enabledTools atual, devolve o novo array.
 *  - Se contém algum alias e NÃO contém o canônico → adiciona o canônico.
 *  - Com dropAliases → remove também os nomes de alias.
 * Preserva a ordem e remove duplicatas.
 */
export function computeMigratedTools(
  enabledTools: string[],
  opts: { dropAliases: boolean },
): string[] {
  const hasAlias = enabledTools.some((t) => (ALIASES as readonly string[]).includes(t))
  if (!hasAlias) return enabledTools // nada a fazer

  let next = [...enabledTools]
  if (!next.includes(CANONICAL)) next.push(CANONICAL)
  if (opts.dropAliases) {
    next = next.filter((t) => !(ALIASES as readonly string[]).includes(t))
  }
  // dedup preservando ordem
  return next.filter((t, i) => next.indexOf(t) === i)
}

async function main() {
  const apply = process.argv.includes('--apply')
  const dropAliases = process.argv.includes('--drop-aliases')

  console.log(
    `\n🔧 Migração handoff tools — modo: ${apply ? 'APPLY' : 'DRY-RUN'}` +
      `${dropAliases ? ' (+drop-aliases)' : ''}\n`,
  )

  const agents = await database.aIAgentConfig.findMany({
    where: { enabledTools: { hasSome: [...ALIASES] } },
    select: { id: true, name: true, enabledTools: true },
  })

  console.log(`Agentes com alias (notify_team/dispatch_to_agent): ${agents.length}\n`)

  let changed = 0
  for (const agent of agents) {
    const next = computeMigratedTools(agent.enabledTools, { dropAliases })
    const isChanged =
      next.length !== agent.enabledTools.length ||
      next.some((t, i) => t !== agent.enabledTools[i])

    if (!isChanged) continue
    changed++

    console.log(`• ${agent.name} (${agent.id})`)
    console.log(`    antes:  [${agent.enabledTools.join(', ')}]`)
    console.log(`    depois: [${next.join(', ')}]`)

    if (apply) {
      await database.aIAgentConfig.update({
        where: { id: agent.id },
        data: { enabledTools: { set: next } },
      })
    }
  }

  console.log(
    `\n${apply ? '✅ Aplicado' : '👀 Dry-run'}: ${changed} agente(s) ` +
      `${apply ? 'atualizado(s)' : 'seriam atualizados'}.` +
      `${apply ? '' : ' Rode com --apply para gravar.'}\n`,
  )

  await database.$disconnect()
}

main().catch(async (err) => {
  console.error('\n❌ Falha na migração:', err)
  await database.$disconnect().catch(() => {})
  process.exit(1)
})
