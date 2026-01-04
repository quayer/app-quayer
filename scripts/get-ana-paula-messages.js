const UAZAPI_URL = 'https://quayer.uazapi.com';
const TOKEN = 'cb10c0f4-4823-433b-8a9d-567f848b23e7'; // Quayer Tech Antigravtiy
const WA_CHATID = '5511992222753@s.whatsapp.net';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     MENSAGENS DA ANA PAULA (5511992222753)                    ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('📊 DADOS DO CHAT NA UZAPI:');
  console.log('   Nome: Ana Paula');
  console.log('   Phone: +55 11 99222-2753');
  console.log('   wa_chatid: 5511992222753@s.whatsapp.net');
  console.log('   Owner (instância): 5511940636426');
  console.log('   Última msg: "Te amo sds"');
  console.log('   Unread: 61 mensagens não lidas');
  console.log('');

  // Tentar diferentes formatos de chatid
  const chatIds = [
    WA_CHATID,
    '5511992222753',
    'r8151a84083b591', // ID interno do chat
  ];

  for (const chatid of chatIds) {
    console.log(`\n🔍 Tentando buscar mensagens com chatid: ${chatid}`);

    const res = await fetch(`${UAZAPI_URL}/message/find`, {
      method: 'POST',
      headers: {
        'token': TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chatid: chatid,
        limit: 50,
        offset: 0
      })
    });

    if (res.ok) {
      const data = await res.json();
      const msgs = data.messages || data.data || data || [];

      console.log(`   ✅ Response OK - Mensagens: ${Array.isArray(msgs) ? msgs.length : 'N/A'}`);

      if (Array.isArray(msgs) && msgs.length > 0) {
        console.log('\n   📨 Últimas 15 mensagens:\n');

        msgs.slice(-15).forEach((m, i) => {
          const dir = m.fromMe ? '→ [VOCÊ]      ' : '← [ANA PAULA] ';
          const content = m.body || m.text || m.content?.text || `[${m.type || 'unknown'}]`;
          const displayContent = content.length > 60 ? content.substring(0, 60) + '...' : content;
          const time = m.timestamp ? new Date(m.timestamp * 1000).toLocaleString('pt-BR') : 'N/A';

          console.log(`   ${i+1}. ${dir} ${time}`);
          console.log(`      Tipo: ${m.type || 'N/A'} | Status: ${m.status || 'N/A'}`);
          console.log(`      Conteúdo: ${displayContent}`);
          if (m.mediaUrl || m.media) console.log(`      📎 Mídia: Sim`);
          console.log('');
        });

        // Estatísticas
        const inbound = msgs.filter(m => !m.fromMe).length;
        const outbound = msgs.filter(m => m.fromMe).length;
        console.log('   ═══════════════════════════════════════════════════════');
        console.log(`   📊 ESTATÍSTICAS: ${inbound} recebidas / ${outbound} enviadas`);
        console.log('   ═══════════════════════════════════════════════════════');

        break; // Encontrou mensagens, pode parar
      }
    } else {
      console.log(`   ❌ Erro: ${res.status}`);
      const text = await res.text();
      console.log(`   Response: ${text.substring(0, 200)}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    ANÁLISE DO FRONTEND                        ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Session ID no app: 87945a93-6bca-49b9-96dd-7f536dd71caa');
  console.log('');
  console.log('O frontend busca mensagens via:');
  console.log('   GET /api/v1/messages/?sessionId=87945a93-6bca-49b9-96dd-7f536dd71caa');
  console.log('');
  console.log('Para verificar se o problema está no frontend ou no banco,');
  console.log('precisamos acessar o banco Prisma de produção (não o Supabase).');
}

main().catch(console.error);
