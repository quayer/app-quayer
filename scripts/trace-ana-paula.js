const { Client } = require('pg');
const client = new Client({
  host: '91.98.142.177', port: 5432, database: 'postgres',
  user: 'postgres', password: 'emYzpWwkJhPe_ZTmVEPyi42p_ac7W3Be', ssl: false
});

async function main() {
  await client.connect();
  console.log('✅ Conectado\n');

  // 1. Buscar sessão da Ana Paula
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       RASTREANDO ORIGEM DO CONTATO ANA PAULA                  ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const session = await client.query(`
    SELECT
      s.*,
      c.name as contact_name,
      c.phone_number,
      c.source,
      c.external_id
    FROM whatsapp.sessions s
    JOIN whatsapp.contacts c ON c.id = s.contact_id
    WHERE c.phone_number = '558496056005'
    ORDER BY s.created_at DESC
    LIMIT 1
  `);

  if (session.rows.length === 0) {
    console.log('❌ Sessão não encontrada');
    await client.end();
    return;
  }

  const s = session.rows[0];

  console.log('📱 CONTATO:');
  console.log(`   Nome: ${s.contact_name}`);
  console.log(`   Telefone: ${s.phone_number}`);
  console.log(`   External ID: ${s.external_id}`);
  console.log(`   Source: ${s.source}`);

  console.log('\n📋 SESSÃO:');
  console.log(`   Session ID: ${s.id}`);
  console.log(`   Status: ${s.status}`);
  console.log(`   Owner Phone: ${s.owner_phone}`);
  console.log(`   Integration Token: ${s.integration_token}`);
  console.log(`   Criada em: ${s.created_at}`);
  console.log(`   Organization ID: ${s.organization_id}`);

  // 2. Verificar se existe uma organização
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    ORGANIZAÇÃO                                ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const org = await client.query(`
    SELECT * FROM whatsapp.organizations
    WHERE id = $1
  `, [s.organization_id]);

  if (org.rows.length > 0) {
    console.log('Organização encontrada:');
    Object.entries(org.rows[0]).forEach(([k, v]) => {
      console.log(`   ${k}: ${v}`);
    });
  } else {
    console.log('❌ Organização não encontrada');
  }

  // 3. Verificar todas as sessões com esse owner_phone (instância)
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`        INSTÂNCIA: ${s.owner_phone}                            `);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const instanceSessions = await client.query(`
    SELECT
      s.id,
      s.status,
      s.created_at,
      c.name,
      c.phone_number
    FROM whatsapp.sessions s
    JOIN whatsapp.contacts c ON c.id = s.contact_id
    WHERE s.owner_phone = $1
    ORDER BY s.created_at DESC
    LIMIT 10
  `, [s.owner_phone]);

  console.log(`Últimas 10 sessões desta instância (${s.owner_phone}):\n`);
  instanceSessions.rows.forEach((sess, i) => {
    console.log(`  ${i+1}. ${sess.name || 'Sem nome'} - ${sess.phone_number}`);
    console.log(`     Status: ${sess.status} | Criada: ${sess.created_at}`);
    console.log('');
  });

  // 4. Comparar com UZAPI - qual instância tem esse owner_phone?
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    CORRELAÇÃO COM UZAPI                       ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Owner Phone da sessão: ${s.owner_phone}`);
  console.log(`Integration Token: ${s.integration_token}`);
  console.log('');
  console.log('💡 O owner_phone (5541936180403) é o número da instância WhatsApp');
  console.log('   que recebeu a mensagem da Ana Paula.');
  console.log('');
  console.log('   Para encontrar na UZAPI, procure a instância com esse número');
  console.log('   ou com o integration_token correspondente.');

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
