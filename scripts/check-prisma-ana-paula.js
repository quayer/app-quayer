const { Client } = require('pg');

const client = new Client({
  host: '91.98.142.177',
  port: 5432,
  database: 'prd-quayer',
  user: 'root',
  password: 'muPfMnXdF7ie',
  ssl: false
});

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     VERIFICANDO BANCO PRISMA - ANA PAULA (5511992222753)      ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    await client.connect();
    console.log('✅ Conectado ao banco prd-quayer\n');

    // 1. Listar todas as tabelas
    console.log('📋 TABELAS DISPONÍVEIS:');
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    tables.rows.forEach(t => console.log(`   - ${t.table_name}`));

    // 2. Buscar contato Ana Paula
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    BUSCA POR CONTATO                          ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Tentar diferentes formatos de busca
    const phoneVariations = [
      '5511992222753',
      '+5511992222753',
      '11992222753',
      '992222753',
      '5511992222753@s.whatsapp.net'
    ];

    let contactFound = null;

    for (const phone of phoneVariations) {
      const contact = await client.query(`
        SELECT * FROM "Contact"
        WHERE phone LIKE $1
           OR "whatsappId" LIKE $1
           OR "externalId" LIKE $1
      `, [`%${phone}%`]);

      if (contact.rows.length > 0) {
        console.log(`✅ Contato encontrado com: ${phone}`);
        contactFound = contact.rows[0];
        break;
      }
    }

    if (contactFound) {
      console.log('\n📱 DADOS DO CONTATO:');
      Object.entries(contactFound).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          console.log(`   ${key}: ${value}`);
        }
      });

      // 3. Buscar sessões do contato
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('                    SESSÕES DO CONTATO                         ');
      console.log('═══════════════════════════════════════════════════════════════\n');

      const sessions = await client.query(`
        SELECT * FROM "ChatSession"
        WHERE "contactId" = $1
        ORDER BY "createdAt" DESC
      `, [contactFound.id]);

      console.log(`Total de sessões: ${sessions.rows.length}\n`);

      sessions.rows.forEach((s, i) => {
        console.log(`${i+1}. Session ID: ${s.id}`);
        console.log(`   Status: ${s.status}`);
        console.log(`   Instance ID: ${s.instanceId}`);
        console.log(`   Created: ${s.createdAt}`);
        console.log(`   Updated: ${s.updatedAt}`);
        console.log('');
      });

      // 4. Buscar mensagens da sessão específica
      const targetSessionId = '87945a93-6bca-49b9-96dd-7f536dd71caa';

      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`     MENSAGENS DA SESSÃO ${targetSessionId.substring(0, 8)}...`);
      console.log('═══════════════════════════════════════════════════════════════\n');

      const messages = await client.query(`
        SELECT * FROM "Message"
        WHERE "sessionId" = $1
        ORDER BY "createdAt" DESC
        LIMIT 20
      `, [targetSessionId]);

      console.log(`Total de mensagens encontradas: ${messages.rows.length}\n`);

      if (messages.rows.length > 0) {
        messages.rows.reverse().forEach((m, i) => {
          const dir = m.direction === 'OUTBOUND' ? '→ [ENVIADA]' : '← [RECEBIDA]';
          const content = m.content || m.body || `[${m.type}]`;
          const displayContent = content.length > 60 ? content.substring(0, 60) + '...' : content;
          console.log(`${i+1}. ${dir} ${m.createdAt}`);
          console.log(`   Tipo: ${m.type} | Status: ${m.status}`);
          console.log(`   Conteúdo: ${displayContent}`);
          console.log('');
        });
      }

    } else {
      console.log('❌ Contato não encontrado em nenhuma variação de telefone');

      // Listar alguns contatos para referência
      console.log('\n📋 Últimos 10 contatos cadastrados:\n');
      const recentContacts = await client.query(`
        SELECT id, name, phone, "whatsappId", "createdAt"
        FROM "Contact"
        ORDER BY "createdAt" DESC
        LIMIT 10
      `);

      recentContacts.rows.forEach((c, i) => {
        console.log(`${i+1}. ${c.name || 'Sem nome'}`);
        console.log(`   Phone: ${c.phone || 'N/A'}`);
        console.log(`   WhatsApp ID: ${c.whatsappId || 'N/A'}`);
        console.log('');
      });
    }

    // 5. Buscar diretamente pela sessão
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('     BUSCA DIRETA PELA SESSÃO 87945a93-6bca-49b9-96dd-7f536dd71caa');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const directSession = await client.query(`
      SELECT
        s.*,
        c.name as contact_name,
        c.phone as contact_phone,
        c."whatsappId" as contact_whatsapp_id
      FROM "ChatSession" s
      LEFT JOIN "Contact" c ON c.id = s."contactId"
      WHERE s.id = '87945a93-6bca-49b9-96dd-7f536dd71caa'
    `);

    if (directSession.rows.length > 0) {
      const s = directSession.rows[0];
      console.log('✅ SESSÃO ENCONTRADA:\n');
      console.log(`   Session ID: ${s.id}`);
      console.log(`   Status: ${s.status}`);
      console.log(`   Contact Name: ${s.contact_name}`);
      console.log(`   Contact Phone: ${s.contact_phone}`);
      console.log(`   Contact WhatsApp ID: ${s.contact_whatsapp_id}`);
      console.log(`   Instance ID: ${s.instanceId}`);
      console.log(`   Created: ${s.createdAt}`);
      console.log(`   Updated: ${s.updatedAt}`);

      // Contar mensagens
      const msgCount = await client.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN direction = 'INBOUND' THEN 1 ELSE 0 END) as inbound,
          SUM(CASE WHEN direction = 'OUTBOUND' THEN 1 ELSE 0 END) as outbound
        FROM "Message"
        WHERE "sessionId" = '87945a93-6bca-49b9-96dd-7f536dd71caa'
      `);

      const counts = msgCount.rows[0];
      console.log(`\n   📊 ESTATÍSTICAS DE MENSAGENS:`);
      console.log(`      Total: ${counts.total}`);
      console.log(`      Recebidas: ${counts.inbound}`);
      console.log(`      Enviadas: ${counts.outbound}`);
    } else {
      console.log('❌ Sessão não encontrada no banco');
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);

    if (error.message.includes('password authentication')) {
      console.log('\n💡 Credenciais incorretas. Verifique usuário e senha.');
    } else if (error.message.includes('does not exist')) {
      console.log('\n💡 Database ou tabela não existe.');
    }
  } finally {
    await client.end();
  }
}

main();
