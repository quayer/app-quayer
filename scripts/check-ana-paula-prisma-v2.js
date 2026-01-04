const { Client } = require('pg');

const client = new Client({
  host: '91.98.142.177',
  port: 5432,
  database: 'quayer',
  user: 'postgres',
  password: 'emYzpWwkJhPe_ZTmVEPyi42p_ac7W3Be',
  ssl: false
});

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     VERIFICANDO BANCO PRISMA (quayer) - ANA PAULA             ');
  console.log('     Número: 5511992222753                                     ');
  console.log('     Session: 87945a93-6bca-49b9-96dd-7f536dd71caa             ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    await client.connect();
    console.log('✅ Conectado ao banco quayer\n');

    // 1. Buscar contato Ana Paula por phoneNumber
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    BUSCA POR CONTATO                          ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const phoneVariations = [
      '5511992222753',
      '+5511992222753',
      '11992222753',
      '992222753'
    ];

    let contactFound = null;

    for (const phone of phoneVariations) {
      const contact = await client.query(`
        SELECT * FROM "Contact"
        WHERE "phoneNumber" LIKE $1
      `, [`%${phone}%`]);

      if (contact.rows.length > 0) {
        console.log(`✅ Contato encontrado com phoneNumber contendo: ${phone}`);
        contactFound = contact.rows[0];
        break;
      }
    }

    if (contactFound) {
      console.log('\n📱 DADOS DO CONTATO:');
      console.log(`   ID: ${contactFound.id}`);
      console.log(`   Nome: ${contactFound.name}`);
      console.log(`   phoneNumber: ${contactFound.phoneNumber}`);
      console.log(`   profilePicUrl: ${contactFound.profilePicUrl || 'N/A'}`);
      console.log(`   isBusiness: ${contactFound.isBusiness}`);
      console.log(`   organizationId: ${contactFound.organizationId}`);
      console.log(`   source: ${contactFound.source}`);
      console.log(`   externalId: ${contactFound.externalId}`);
      console.log(`   createdAt: ${contactFound.createdAt}`);

      // 2. Buscar sessões do contato
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
        console.log(`   Connection ID: ${s.connectionId}`);
        console.log(`   AI Enabled: ${s.aiEnabled}`);
        console.log(`   Total Messages: ${s.totalMessages}`);
        console.log(`   Last Message: ${s.lastMessageAt}`);
        console.log(`   Created: ${s.createdAt}`);
        console.log('');
      });

      // 3. Verificar se a sessão específica existe
      const targetSessionId = '87945a93-6bca-49b9-96dd-7f536dd71caa';
      const hasTargetSession = sessions.rows.some(s => s.id === targetSessionId);

      if (hasTargetSession) {
        console.log(`✅ Sessão ${targetSessionId.substring(0, 8)}... pertence a este contato!`);
      } else {
        console.log(`⚠️ Sessão ${targetSessionId.substring(0, 8)}... NÃO encontrada para este contato`);
      }

    } else {
      console.log('❌ Contato com número 5511992222753 NÃO encontrado no banco Prisma');

      // Mostrar contatos recentes
      console.log('\n📋 Últimos 15 contatos cadastrados:\n');
      const recentContacts = await client.query(`
        SELECT id, name, "phoneNumber", "createdAt"
        FROM "Contact"
        ORDER BY "createdAt" DESC
        LIMIT 15
      `);

      recentContacts.rows.forEach((c, i) => {
        console.log(`${i+1}. ${c.name || 'Sem nome'}`);
        console.log(`   Phone: ${c.phoneNumber}`);
        console.log(`   Created: ${c.createdAt}`);
        console.log('');
      });
    }

    // 4. Buscar diretamente pela sessão específica
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  BUSCA DIRETA PELA SESSÃO 87945a93-6bca-49b9-96dd-7f536dd71caa');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const directSession = await client.query(`
      SELECT
        s.*,
        c.name as contact_name,
        c."phoneNumber" as contact_phone,
        conn.name as connection_name,
        conn."phoneNumber" as connection_phone
      FROM "ChatSession" s
      LEFT JOIN "Contact" c ON c.id = s."contactId"
      LEFT JOIN connections conn ON conn.id = s."connectionId"
      WHERE s.id = '87945a93-6bca-49b9-96dd-7f536dd71caa'
    `);

    if (directSession.rows.length > 0) {
      const s = directSession.rows[0];
      console.log('✅ SESSÃO ENCONTRADA:\n');
      console.log(`   Session ID: ${s.id}`);
      console.log(`   Status: ${s.status}`);
      console.log(`   Contact ID: ${s.contactId}`);
      console.log(`   Contact Name: ${s.contact_name}`);
      console.log(`   Contact Phone: ${s.contact_phone}`);
      console.log(`   Connection Name: ${s.connection_name}`);
      console.log(`   Connection Phone: ${s.connection_phone}`);
      console.log(`   AI Enabled: ${s.aiEnabled}`);
      console.log(`   Total Messages: ${s.totalMessages}`);
      console.log(`   Created: ${s.createdAt}`);
      console.log(`   Last Message: ${s.lastMessageAt}`);

      // 5. Buscar mensagens da sessão
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('            MENSAGENS DA SESSÃO (últimas 20)                   ');
      console.log('═══════════════════════════════════════════════════════════════\n');

      const messages = await client.query(`
        SELECT * FROM "Message"
        WHERE "sessionId" = '87945a93-6bca-49b9-96dd-7f536dd71caa'
        ORDER BY "createdAt" DESC
        LIMIT 20
      `);

      console.log(`Total encontrado: ${messages.rows.length} mensagens\n`);

      if (messages.rows.length > 0) {
        // Reverse to show chronological order
        messages.rows.reverse().forEach((m, i) => {
          const dir = m.direction === 'OUTBOUND' ? '→ [ENVIADA]  ' : '← [RECEBIDA] ';
          const author = m.author;
          const content = m.content || `[${m.type}]`;
          const displayContent = content.length > 50 ? content.substring(0, 50) + '...' : content;

          console.log(`${i+1}. ${dir} ${new Date(m.createdAt).toLocaleString('pt-BR')}`);
          console.log(`   Autor: ${author} | Tipo: ${m.type} | Status: ${m.status}`);
          console.log(`   Conteúdo: ${displayContent}`);
          console.log('');
        });
      } else {
        console.log('⚠️ Nenhuma mensagem encontrada para esta sessão');
      }

      // 6. Contar total de mensagens
      const msgCount = await client.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN direction = 'INBOUND' THEN 1 ELSE 0 END) as inbound,
          SUM(CASE WHEN direction = 'OUTBOUND' THEN 1 ELSE 0 END) as outbound
        FROM "Message"
        WHERE "sessionId" = '87945a93-6bca-49b9-96dd-7f536dd71caa'
      `);

      const counts = msgCount.rows[0];
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('                    ESTATÍSTICAS                               ');
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log(`   Total de mensagens no banco: ${counts.total}`);
      console.log(`   Recebidas (INBOUND): ${counts.inbound}`);
      console.log(`   Enviadas (OUTBOUND): ${counts.outbound}`);

      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('                    COMPARAÇÃO COM UZAPI                       ');
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log('   UZAPI: 50 mensagens (31 recebidas, 19 enviadas)');
      console.log(`   BANCO: ${counts.total} mensagens (${counts.inbound} recebidas, ${counts.outbound} enviadas)`);

      if (parseInt(counts.total) < 50) {
        console.log('\n   ⚠️ PROBLEMA DETECTADO: O banco tem menos mensagens que a UZAPI!');
        console.log('   Isso indica que as mensagens não estão sendo sincronizadas corretamente.');
      } else if (parseInt(counts.total) > 50) {
        console.log('\n   ℹ️ O banco tem mais mensagens que a UZAPI (pode ser normal se UZAPI retornou limite)');
      } else {
        console.log('\n   ✅ Quantidade de mensagens corresponde entre UZAPI e banco');
      }

    } else {
      console.log('❌ Sessão 87945a93-6bca-49b9-96dd-7f536dd71caa NÃO encontrada no banco');

      // Listar algumas sessões recentes
      console.log('\n📋 Últimas 10 sessões cadastradas:\n');
      const recentSessions = await client.query(`
        SELECT s.id, s.status, s."createdAt", c.name, c."phoneNumber"
        FROM "ChatSession" s
        LEFT JOIN "Contact" c ON c.id = s."contactId"
        ORDER BY s."createdAt" DESC
        LIMIT 10
      `);

      recentSessions.rows.forEach((s, i) => {
        console.log(`${i+1}. ${s.id.substring(0, 8)}... - ${s.name || 'Sem nome'} (${s.phoneNumber})`);
        console.log(`   Status: ${s.status} | Created: ${s.createdAt}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
  } finally {
    await client.end();
  }
}

main();
