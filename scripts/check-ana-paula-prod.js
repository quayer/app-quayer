const { Client } = require('pg');

const client = new Client({
  host: '91.98.142.177',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'emYzpWwkJhPe_ZTmVEPyi42p_ac7W3Be',
  ssl: false
});

async function main() {
  try {
    await client.connect();
    console.log('✅ Conectado ao banco de produção\n');

    // Primeiro ver a estrutura das tabelas
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    ESTRUTURA DAS TABELAS                       ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const contactCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'whatsapp' AND table_name = 'contacts'
    `);
    console.log('whatsapp.contacts columns:');
    contactCols.rows.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));

    const sessionCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'whatsapp' AND table_name = 'sessions'
    `);
    console.log('\nwhatsapp.sessions columns:');
    sessionCols.rows.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));

    const messageCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'whatsapp' AND table_name = 'messages'
    `);
    console.log('\nwhatsapp.messages columns:');
    messageCols.rows.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));

    // Buscar contato Ana Paula
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                         CONTATO                               ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const contacts = await client.query(`
      SELECT *
      FROM whatsapp.contacts
      WHERE phone_number LIKE '%992222753%'
         OR name ILIKE '%ana paula%'
    `);

    console.log('Contatos encontrados:', contacts.rows.length);
    if (contacts.rows.length > 0) {
      contacts.rows.forEach(c => {
        console.log('\n  Dados do contato:');
        Object.entries(c).forEach(([key, value]) => {
          const displayValue = value && typeof value === 'string' && value.length > 100
            ? value.substring(0, 100) + '...'
            : value;
          console.log(`    ${key}: ${displayValue}`);
        });
      });
    } else {
      console.log('  ❌ Nenhum contato encontrado com esse número/nome');
    }

    // Buscar sessões
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                         SESSÕES                               ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const sessions = await client.query(`
      SELECT *
      FROM whatsapp.sessions
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log('Últimas 10 sessões:');
    sessions.rows.forEach((s, i) => {
      console.log(`\n  ${i+1}. Session:`);
      Object.entries(s).forEach(([key, value]) => {
        const displayValue = value && typeof value === 'string' && value.length > 80
          ? value.substring(0, 80) + '...'
          : value;
        console.log(`      ${key}: ${displayValue}`);
      });
    });

    // Buscar mensagens
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                        MENSAGENS                              ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const messages = await client.query(`
      SELECT *
      FROM whatsapp.messages
      ORDER BY created_at DESC
      LIMIT 20
    `);

    console.log('Últimas 20 mensagens:');
    messages.rows.forEach((m, i) => {
      const content = m.content || m.body || m.text || `[${m.type || 'unknown'}]`;
      const displayContent = content.length > 60 ? content.substring(0, 60) + '...' : content;
      console.log(`\n  ${i+1}. ${m.direction || m.from_me ? 'OUTBOUND' : 'INBOUND'}`);
      console.log(`      Conteúdo: ${displayContent}`);
      console.log(`      Tipo: ${m.type || 'N/A'}`);
      console.log(`      Data: ${m.created_at || m.timestamp}`);
      if (m.phone_number) console.log(`      Phone: ${m.phone_number}`);
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
  } finally {
    await client.end();
  }
}

main();
