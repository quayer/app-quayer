const { Client } = require('pg');
const client = new Client({
  host: '91.98.142.177', port: 5432, database: 'postgres',
  user: 'postgres', password: 'emYzpWwkJhPe_ZTmVEPyi42p_ac7W3Be', ssl: false
});

async function main() {
  await client.connect();

  // Buscar qualquer contato com parte do número
  console.log('🔍 Buscando contatos com "992222753" ou "11992222753"...\n');

  const result = await client.query(`
    SELECT * FROM whatsapp.contacts
    WHERE phone_number LIKE '%992222753%'
       OR phone_number LIKE '%11992222753%'
       OR external_id LIKE '%992222753%'
  `);

  if (result.rows.length > 0) {
    console.log('✅ Encontrado(s):', result.rows.length);
    result.rows.forEach(c => {
      console.log('  - ID:', c.id);
      console.log('    Nome:', c.name);
      console.log('    Phone:', c.phone_number);
      console.log('    External:', c.external_id);
      console.log('');
    });
  } else {
    console.log('❌ Nenhum contato encontrado com esse número');

    // Listar últimos 20 contatos
    console.log('\n📋 Últimos 20 contatos cadastrados:\n');
    const recent = await client.query(`
      SELECT id, name, phone_number, created_at
      FROM whatsapp.contacts
      ORDER BY created_at DESC
      LIMIT 20
    `);
    recent.rows.forEach((c, i) => {
      console.log(`  ${i+1}. ${c.name || 'Sem nome'} - ${c.phone_number}`);
    });
  }

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
