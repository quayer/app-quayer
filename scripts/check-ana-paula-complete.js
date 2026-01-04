const { Client } = require('pg');

const client = new Client({
  host: '91.98.142.177',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'emYzpWwkJhPe_ZTmVEPyi42p_ac7W3Be',
  ssl: false
});

// Ana Paula ID do banco
const ANA_PAULA_CONTACT_ID = '17c37931-2fc2-4404-a57d-840ae07117aa';
const PHONE_SEARCHED = '5511992222753';

async function main() {
  try {
    await client.connect();
    console.log('✅ Conectado ao banco de produção\n');

    // 1. Verificar se existe contato com o número buscado
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`        BUSCA POR NÚMERO: ${PHONE_SEARCHED}                    `);
    console.log('═══════════════════════════════════════════════════════════════\n');

    const searchContacts = await client.query(`
      SELECT * FROM whatsapp.contacts
      WHERE phone_number LIKE '%992222753%'
         OR phone_number LIKE '%11992222753%'
    `);

    if (searchContacts.rows.length > 0) {
      console.log('✅ Contato encontrado com esse número:');
      searchContacts.rows.forEach(c => {
        console.log(`   ID: ${c.id}`);
        console.log(`   Nome: ${c.name}`);
        console.log(`   Telefone: ${c.phone_number}`);
      });
    } else {
      console.log('❌ Nenhum contato com número 5511992222753 encontrado');
      console.log('\n📋 Buscando todos os contatos "Ana Paula"...');

      const anaPaulas = await client.query(`
        SELECT * FROM whatsapp.contacts
        WHERE name ILIKE '%ana%paula%'
      `);

      console.log(`\nEncontrados ${anaPaulas.rows.length} contato(s) Ana Paula:`);
      anaPaulas.rows.forEach((c, i) => {
        console.log(`\n  ${i+1}. ${c.name}`);
        console.log(`     ID: ${c.id}`);
        console.log(`     Telefone: ${c.phone_number}`);
        console.log(`     Criado: ${c.created_at}`);
      });
    }

    // 2. Buscar sessões da Ana Paula encontrada
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('         SESSÕES DA ANA PAULA (558496056005)                   ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const sessions = await client.query(`
      SELECT s.*, c.name as contact_name, c.phone_number
      FROM whatsapp.sessions s
      JOIN whatsapp.contacts c ON c.id = s.contact_id
      WHERE s.contact_id = $1
      ORDER BY s.created_at DESC
    `, [ANA_PAULA_CONTACT_ID]);

    console.log(`Sessões encontradas: ${sessions.rows.length}`);
    sessions.rows.forEach((s, i) => {
      console.log(`\n  ${i+1}. Session ID: ${s.id}`);
      console.log(`     Status: ${s.status}`);
      console.log(`     Criada: ${s.created_at}`);
      console.log(`     Última atividade: ${s.last_activity}`);
      console.log(`     Owner Phone: ${s.owner_phone}`);
      console.log(`     Chatwoot Conv: ${s.chatwoot_conversation_id || 'N/A'}`);
    });

    // 3. Buscar mensagens da Ana Paula
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('        MENSAGENS DA ANA PAULA (558496056005)                  ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const messages = await client.query(`
      SELECT m.*, c.name as contact_name
      FROM whatsapp.messages m
      JOIN whatsapp.contacts c ON c.id = m.contact_id
      WHERE m.contact_id = $1
      ORDER BY m.created_at ASC
    `, [ANA_PAULA_CONTACT_ID]);

    console.log(`Total de mensagens: ${messages.rows.length}`);

    const inbound = messages.rows.filter(m => m.direction === 'INBOUND').length;
    const outbound = messages.rows.filter(m => m.direction === 'OUTBOUND').length;

    console.log(`   INBOUND (dela): ${inbound}`);
    console.log(`   OUTBOUND (respostas): ${outbound}`);

    console.log('\n───────────────────────────────────────────────────────────────');
    console.log('                    HISTÓRICO DE MENSAGENS                     ');
    console.log('───────────────────────────────────────────────────────────────\n');

    messages.rows.forEach((m, i) => {
      const arrow = m.direction === 'OUTBOUND' ? '→ [SISTEMA]  ' : '← [ANA PAULA]';
      const date = new Date(m.created_at).toLocaleString('pt-BR');

      // Extrair texto do content JSONB
      let textContent = '';
      if (m.content) {
        if (typeof m.content === 'object') {
          textContent = m.content.text || m.content.body || m.content.message || JSON.stringify(m.content);
        } else {
          textContent = String(m.content);
        }
      }
      const displayContent = textContent.length > 80 ? textContent.substring(0, 80) + '...' : textContent;

      console.log(`${i+1}. ${arrow} ${date}`);
      console.log(`   Tipo: ${m.type} | Status: ${m.status} | Author: ${m.author || 'N/A'}`);
      console.log(`   Conteúdo: ${displayContent}`);
      if (m.media_url) {
        console.log(`   📎 Mídia: ${m.media_url.substring(0, 60)}...`);
      }
      if (m.ai_model) {
        console.log(`   🤖 Modelo: ${m.ai_model} | Tokens: ${m.input_tokens}/${m.output_tokens}`);
      }
      console.log('');
    });

    // 4. Resumo
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                         RESUMO                                ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('📱 PROBLEMA IDENTIFICADO:');
    console.log(`   Você buscou por: ${PHONE_SEARCHED}`);
    console.log(`   Ana Paula no banco tem: 558496056005`);
    console.log('');
    console.log('   ⚠️  Os números são DIFERENTES!');
    console.log('   - 5511992222753 = DDD 11 (São Paulo)');
    console.log('   - 558496056005 = DDD 84 (Rio Grande do Norte)');
    console.log('');
    console.log('   Pode haver OUTRA Ana Paula com o número 5511992222753,');
    console.log('   ou o número foi digitado incorretamente.');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
  } finally {
    await client.end();
  }
}

main();
