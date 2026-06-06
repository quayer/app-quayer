/**
 * Inspeciona a dead-letter de envio OUTBOUND (Redis list `outbound:deadletter`).
 * READ-ONLY — não remove nem reprocessa nada. Substitui o painel de ops (não há
 * admin UI; operações via Claude Code/MCP).
 *
 * Run with: npx tsx scripts/inspect-deadletter.ts [limit]
 *   limit = quantas entradas recentes detalhar (default 50, máx 1000).
 */

import 'dotenv/config';
import { inspectDeadLetter } from '../src/server/communication/services/outbound-deadletter';

async function main() {
  const limit = Number.parseInt(process.argv[2] ?? '', 10);
  const result = await inspectDeadLetter(
    Number.isFinite(limit) ? { limit } : {},
  );

  if (!result.ok) {
    console.error('\n❌ Não foi possível ler a dead-letter (Redis indisponível?).');
    process.exit(1);
  }

  console.log(`\n📮 Dead-letter outbound — total na list: ${result.total}`);
  console.log(`   Detalhando as ${result.returned} mais recentes.`);
  if (result.newest) console.log(`   Mais recente: ${result.newest}`);
  if (result.oldest) console.log(`   Mais antiga (na amostra): ${result.oldest}`);

  if (result.returned === 0) {
    console.log('\n✅ Nada na dead-letter.\n');
    return;
  }

  const top = (rec: Record<string, number>) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

  console.log('\n— Por organização —');
  for (const [org, count] of top(result.byOrg)) {
    console.log(`   ${count.toString().padStart(4)}  ${org}`);
  }

  console.log('\n— Por erro —');
  for (const [err, count] of top(result.byError)) {
    console.log(`   ${count.toString().padStart(4)}  ${err}`);
  }

  console.log('\n— Entradas (mais recentes) —');
  for (const e of result.entries) {
    console.log(
      `   [${e.timestamp}] org=${e.organizationId} phone=${e.phone}\n` +
        `        erro: ${e.error}`,
    );
  }
  console.log('');
}

main();
