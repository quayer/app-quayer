const { Client } = require('pg');

// Diferentes combinações para testar
const connections = [
  {
    name: 'prd-quayer com root',
    host: '91.98.142.177',
    database: 'prd-quayer',
    user: 'root',
    password: 'muPfMnXdF7ie'
  },
  {
    name: 'prd-quayer com postgres',
    host: '91.98.142.177',
    database: 'prd-quayer',
    user: 'postgres',
    password: 'muPfMnXdF7ie'
  },
  {
    name: 'postgres db com postgres user (senha antiga)',
    host: '91.98.142.177',
    database: 'postgres',
    user: 'postgres',
    password: 'emYzpWwkJhPe_ZTmVEPyi42p_ac7W3Be'
  },
  {
    name: 'prd-quayer com postgres user (senha antiga)',
    host: '91.98.142.177',
    database: 'prd-quayer',
    user: 'postgres',
    password: 'emYzpWwkJhPe_ZTmVEPyi42p_ac7W3Be'
  },
  {
    name: 'quayer db',
    host: '91.98.142.177',
    database: 'quayer',
    user: 'postgres',
    password: 'emYzpWwkJhPe_ZTmVEPyi42p_ac7W3Be'
  }
];

async function testConnection(config) {
  const client = new Client({
    host: config.host,
    port: 5432,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: false,
    connectionTimeoutMillis: 5000
  });

  try {
    await client.connect();

    // Listar tabelas no schema public
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    await client.end();
    return { success: true, tables: tables.rows.map(t => t.table_name) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     TESTANDO CONEXÕES COM BANCO DE PRODUÇÃO                   ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const config of connections) {
    console.log(`🔌 Testando: ${config.name}`);
    console.log(`   Host: ${config.host}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}`);

    const result = await testConnection(config);

    if (result.success) {
      console.log(`   ✅ CONECTADO!`);
      console.log(`   📋 Tabelas encontradas (${result.tables.length}):`);

      // Mostrar tabelas relevantes
      const relevantTables = result.tables.filter(t =>
        ['Contact', 'ChatSession', 'Message', 'Instance', 'User', 'Organization'].includes(t)
      );

      if (relevantTables.length > 0) {
        console.log(`   🎯 Tabelas Prisma: ${relevantTables.join(', ')}`);
      }

      // Mostrar primeiras 15 tabelas
      result.tables.slice(0, 15).forEach(t => console.log(`      - ${t}`));
      if (result.tables.length > 15) {
        console.log(`      ... e mais ${result.tables.length - 15} tabelas`);
      }

      // Se encontrou tabelas Prisma, fazer consulta de teste
      if (relevantTables.includes('Contact') || relevantTables.includes('ChatSession')) {
        console.log('\n   🔍 Realizando consultas de teste...');

        const client = new Client({
          host: config.host,
          port: 5432,
          database: config.database,
          user: config.user,
          password: config.password,
          ssl: false
        });

        await client.connect();

        // Buscar contato Ana Paula
        try {
          const contact = await client.query(`
            SELECT * FROM "Contact"
            WHERE phone LIKE '%992222753%'
               OR "whatsappId" LIKE '%992222753%'
            LIMIT 1
          `);

          if (contact.rows.length > 0) {
            console.log('\n   ✅ CONTATO ANA PAULA ENCONTRADO!');
            const c = contact.rows[0];
            console.log(`      ID: ${c.id}`);
            console.log(`      Nome: ${c.name}`);
            console.log(`      Phone: ${c.phone}`);
            console.log(`      WhatsApp ID: ${c.whatsappId}`);
          } else {
            console.log('\n   ⚠️ Contato Ana Paula não encontrado nesta database');
          }
        } catch (e) {
          console.log(`   ⚠️ Erro ao buscar contato: ${e.message}`);
        }

        // Buscar sessão específica
        try {
          const session = await client.query(`
            SELECT s.*, c.name as contact_name, c.phone as contact_phone
            FROM "ChatSession" s
            LEFT JOIN "Contact" c ON c.id = s."contactId"
            WHERE s.id = '87945a93-6bca-49b9-96dd-7f536dd71caa'
          `);

          if (session.rows.length > 0) {
            console.log('\n   ✅ SESSÃO 87945a93... ENCONTRADA!');
            const s = session.rows[0];
            console.log(`      Contact: ${s.contact_name} - ${s.contact_phone}`);
            console.log(`      Status: ${s.status}`);
            console.log(`      Instance: ${s.instanceId}`);
          } else {
            console.log('\n   ⚠️ Sessão 87945a93... não encontrada');
          }
        } catch (e) {
          console.log(`   ⚠️ Erro ao buscar sessão: ${e.message}`);
        }

        await client.end();
      }

    } else {
      console.log(`   ❌ Falhou: ${result.error}`);
    }

    console.log('');
  }
}

main().catch(console.error);
