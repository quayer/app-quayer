const UAZAPI_URL = 'https://quayer.uazapi.com';
const PHONE_NUMBER = '5511992222753';

// Token da instância "Quayer Tech Antigravtiy" (da listagem anterior)
const QUAYER_TECH_TOKEN = 'cb10c0f4-4823-433b-8a9d-567f84';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     BUSCANDO ANA PAULA NA INSTÂNCIA QUAYER TECH ANTIGRAVTIY   ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Primeiro, pegar o token completo da instância
  const ADMIN_TOKEN = 'm04FjGogNfB6faw5jMr2T89cHdQVOb6nyPanIzS20A2FzTbtn6';

  const instancesRes = await fetch(`${UAZAPI_URL}/instance/all`, {
    headers: { 'admintoken': ADMIN_TOKEN }
  });

  const instances = await instancesRes.json();
  const quayerTech = instances.find(i => i.name?.includes('Antigravtiy') || i.instanceName?.includes('Antigravtiy'));

  if (!quayerTech) {
    console.log('❌ Instância Quayer Tech Antigravtiy não encontrada');
    return;
  }

  console.log('✅ Instância encontrada:');
  console.log(`   Nome: ${quayerTech.name || quayerTech.instanceName}`);
  console.log(`   ID: ${quayerTech.id}`);
  console.log(`   Token: ${quayerTech.token}`);
  console.log(`   Status: ${quayerTech.status}`);
  console.log(`   Profile: ${quayerTech.profileName}`);

  const token = quayerTech.token;

  // Buscar chats usando POST /chat/find (endpoint correto)
  console.log('\n📋 Buscando todos os chats...\n');

  // Tentar diferentes endpoints
  const endpoints = [
    { url: '/chat/find', method: 'POST', body: { limit: 100 } },
    { url: '/chat/list', method: 'GET' },
    { url: '/chats', method: 'GET' },
  ];

  let chats = [];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${UAZAPI_URL}${ep.url}`, {
        method: ep.method,
        headers: {
          'token': token,
          'Content-Type': 'application/json'
        },
        body: ep.method === 'POST' ? JSON.stringify(ep.body || {}) : undefined
      });

      if (res.ok) {
        const data = await res.json();
        chats = data.data || data.chats || data || [];
        console.log(`✅ Endpoint ${ep.url} funcionou! ${Array.isArray(chats) ? chats.length : 0} chats`);
        break;
      } else {
        console.log(`❌ ${ep.url}: ${res.status}`);
      }
    } catch (e) {
      console.log(`❌ ${ep.url}: ${e.message}`);
    }
  }

  if (!Array.isArray(chats) || chats.length === 0) {
    console.log('\n⚠️ Nenhum chat encontrado. Tentando buscar mensagem diretamente...');

    // Tentar buscar mensagens pelo número
    const msgRes = await fetch(`${UAZAPI_URL}/message/find`, {
      method: 'POST',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatid: `${PHONE_NUMBER}@s.whatsapp.net`,
        limit: 50
      })
    });

    if (msgRes.ok) {
      const msgData = await msgRes.json();
      console.log('\n✅ Mensagens encontradas:');
      console.log(JSON.stringify(msgData, null, 2).substring(0, 2000));
    } else {
      console.log('❌ Erro ao buscar mensagens:', msgRes.status);
    }

    return;
  }

  // Procurar Ana Paula
  console.log(`\n🔍 Procurando ${PHONE_NUMBER} em ${chats.length} chats...\n`);

  const anaChat = chats.find(c => {
    const id = c.id || c.chatid || c.wa_chatid || '';
    const name = c.name || c.pushname || c.wa_name || '';
    return id.includes('992222753') || name.toLowerCase().includes('ana paula');
  });

  if (anaChat) {
    console.log('✅ CHAT DA ANA PAULA ENCONTRADO!\n');
    console.log(JSON.stringify(anaChat, null, 2));

    // Buscar mensagens
    const chatId = anaChat.id || anaChat.chatid || anaChat.wa_chatid;
    console.log(`\n📨 Buscando mensagens do chat ${chatId}...\n`);

    const msgsRes = await fetch(`${UAZAPI_URL}/message/find`, {
      method: 'POST',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatid: chatId, limit: 50 })
    });

    if (msgsRes.ok) {
      const msgsData = await msgsRes.json();
      const msgs = msgsData.data || msgsData.messages || msgsData || [];

      console.log(`Total: ${Array.isArray(msgs) ? msgs.length : 0} mensagens\n`);

      if (Array.isArray(msgs)) {
        msgs.slice(-10).forEach((m, i) => {
          const dir = m.fromMe ? '→ [VOCÊ]' : '← [ANA]';
          const content = m.body || m.text || m.content || `[${m.type}]`;
          const time = m.timestamp ? new Date(m.timestamp * 1000).toLocaleString('pt-BR') : 'N/A';
          console.log(`${i+1}. ${dir} ${time}`);
          console.log(`   ${content.substring(0, 80)}`);
          console.log('');
        });
      }
    }
  } else {
    console.log('❌ Chat da Ana Paula não encontrado nos chats listados');
    console.log('\nPrimeiros 5 chats:');
    chats.slice(0, 5).forEach((c, i) => {
      console.log(`  ${i+1}. ${c.name || c.pushname || 'N/A'} - ${c.id || c.chatid || 'N/A'}`);
    });
  }
}

main().catch(console.error);
