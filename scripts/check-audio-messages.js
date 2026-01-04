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
  console.log('     VERIFICANDO MENSAGENS DE ÁUDIO NO BANCO                   ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    await client.connect();
    console.log('✅ Conectado ao banco quayer\n');

    // 1. Buscar todas as mensagens de áudio
    const audioMessages = await client.query(`
      SELECT
        m.id,
        m."sessionId",
        m.type,
        m."mediaUrl",
        m."mediaType",
        m."mimeType",
        m."fileName",
        m."mediaDuration",
        m."mediaSize",
        m.direction,
        m.status,
        m."createdAt",
        m."transcriptionStatus",
        c.name as contact_name
      FROM "Message" m
      LEFT JOIN "Contact" c ON c.id = m."contactId"
      WHERE m.type IN ('audio', 'voice')
      ORDER BY m."createdAt" DESC
      LIMIT 30
    `);

    console.log(`Total de mensagens de áudio/voz: ${audioMessages.rows.length}\n`);

    // Estatísticas
    let withUrl = 0;
    let withoutUrl = 0;
    let withDuration = 0;

    audioMessages.rows.forEach((m, i) => {
      const hasUrl = m.mediaUrl && m.mediaUrl.length > 0;
      const urlPreview = hasUrl ? m.mediaUrl.substring(0, 60) + '...' : '[VAZIO]';

      if (hasUrl) withUrl++;
      else withoutUrl++;
      if (m.mediaDuration) withDuration++;

      console.log(`${i+1}. ${m.direction === 'OUTBOUND' ? '→ [ENVIADA]' : '← [RECEBIDA]'} - ${m.contact_name || 'Desconhecido'}`);
      console.log(`   ID: ${m.id.substring(0, 8)}...`);
      console.log(`   Tipo: ${m.type} | MediaType: ${m.mediaType || 'N/A'}`);
      console.log(`   MimeType: ${m.mimeType || 'N/A'}`);
      console.log(`   Duração: ${m.mediaDuration || 'N/A'}s | Tamanho: ${m.mediaSize || 'N/A'} bytes`);
      console.log(`   URL: ${urlPreview}`);
      console.log(`   Transcrição: ${m.transcriptionStatus || 'N/A'}`);
      console.log(`   Data: ${m.createdAt}`);
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    ESTATÍSTICAS                               ');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`   Com mediaUrl: ${withUrl}`);
    console.log(`   Sem mediaUrl: ${withoutUrl}`);
    console.log(`   Com duração: ${withDuration}`);
    console.log(`   Total: ${audioMessages.rows.length}`);

    if (withoutUrl > 0) {
      console.log('\n   ⚠️ PROBLEMA: Mensagens de áudio sem mediaUrl não são reproduzíveis!');
      console.log('   Possíveis causas:');
      console.log('   1. Webhook não extraiu mediaUrl corretamente');
      console.log('   2. UZAPI envia base64 ao invés de URL');
      console.log('   3. Media precisa ser baixada via API mas não foi');
    }

    // 2. Verificar duplicatas
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    VERIFICAÇÃO DE DUPLICATAS                  ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const duplicates = await client.query(`
      SELECT
        "waMessageId",
        COUNT(*) as count
      FROM "Message"
      WHERE "waMessageId" IS NOT NULL
      GROUP BY "waMessageId"
      HAVING COUNT(*) > 1
      LIMIT 20
    `);

    if (duplicates.rows.length > 0) {
      console.log(`⚠️ Encontradas ${duplicates.rows.length} mensagens com waMessageId duplicado:\n`);
      duplicates.rows.forEach((d, i) => {
        console.log(`   ${i+1}. waMessageId: ${d.waMessageId?.substring(0, 30)}... (${d.count}x)`);
      });

      console.log('\n   💡 Isso pode causar duplicatas no frontend!');
      console.log('   Causa: Mesmo webhook processado múltiplas vezes');
    } else {
      console.log('✅ Nenhuma duplicata encontrada no waMessageId');
    }

    // 3. Verificar duplicatas por conteúdo e timestamp
    const contentDupes = await client.query(`
      SELECT
        content,
        "createdAt",
        COUNT(*) as count
      FROM "Message"
      WHERE content IS NOT NULL AND content != ''
      GROUP BY content, "createdAt"
      HAVING COUNT(*) > 1
      LIMIT 10
    `);

    if (contentDupes.rows.length > 0) {
      console.log(`\n⚠️ ${contentDupes.rows.length} mensagens com mesmo conteúdo e timestamp:\n`);
      contentDupes.rows.forEach((d, i) => {
        const preview = d.content.length > 40 ? d.content.substring(0, 40) + '...' : d.content;
        console.log(`   ${i+1}. "${preview}" @ ${d.createdAt} (${d.count}x)`);
      });
    }

    // 4. Verificar mensagens recentes da Ana Paula para ver mediaUrl
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('        MENSAGENS RECENTES (verificar mediaUrl)                ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const recentMedia = await client.query(`
      SELECT
        m.id,
        m.type,
        m.content,
        m."mediaUrl",
        m."mediaType",
        m.direction,
        m."createdAt"
      FROM "Message" m
      WHERE m.type NOT IN ('text')
      ORDER BY m."createdAt" DESC
      LIMIT 15
    `);

    recentMedia.rows.forEach((m, i) => {
      const hasUrl = m.mediaUrl && m.mediaUrl.length > 0;
      console.log(`${i+1}. ${m.type.toUpperCase()} ${m.direction === 'OUTBOUND' ? '→' : '←'}`);
      console.log(`   mediaUrl: ${hasUrl ? '✅ Presente' : '❌ AUSENTE'}`);
      if (hasUrl) {
        const isBase64 = m.mediaUrl.startsWith('data:');
        const isHttp = m.mediaUrl.startsWith('http');
        console.log(`   Formato: ${isBase64 ? 'Base64' : isHttp ? 'HTTP URL' : 'Outro'}`);
      }
      console.log(`   Data: ${m.createdAt}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

main();
