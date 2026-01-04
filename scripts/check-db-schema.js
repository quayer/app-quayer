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

    // Listar schemas
    console.log('═══ SCHEMAS ═══');
    const schemas = await client.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
    `);
    schemas.rows.forEach(s => console.log('  -', s.schema_name));

    // Listar tabelas
    console.log('\n═══ TABELAS ═══');
    const tables = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);
    tables.rows.forEach(t => console.log(`  ${t.table_schema}.${t.table_name}`));

    // Buscar tabelas que parecem ter contatos
    console.log('\n═══ TABELAS COM "CONTACT" OU "CHAT" ═══');
    const contactTables = tables.rows.filter(t =>
      t.table_name.toLowerCase().includes('contact') ||
      t.table_name.toLowerCase().includes('chat') ||
      t.table_name.toLowerCase().includes('session') ||
      t.table_name.toLowerCase().includes('message')
    );
    contactTables.forEach(t => console.log(`  ${t.table_schema}.${t.table_name}`));

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

main();
