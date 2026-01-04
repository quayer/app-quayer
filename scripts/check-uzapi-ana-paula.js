/**
 * Script para buscar dados da Ana Paula na API UZAPI
 */

const UAZAPI_URL = 'https://quayer.uazapi.com';
const UAZAPI_ADMIN_TOKEN = 'm04FjGogNfB6faw5jMr2T89cHdQVOb6nyPanIzS20A2FzTbtn6';
const PHONE_NUMBER = '5511992222753';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('          VERIFICAÇÃO UZAPI - ANA PAULA (5511992222753)         ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // 1. Listar instâncias usando endpoint correto
    console.log('📋 Listando instâncias UZAPI...\n');

    const instancesRes = await fetch(`${UAZAPI_URL}/instance/all`, {
      method: 'GET',
      headers: {
        'admintoken': UAZAPI_ADMIN_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!instancesRes.ok) {
      const errText = await instancesRes.text();
      console.log('❌ Erro ao listar instâncias:', instancesRes.status, errText);
      return;
    }

    const instancesData = await instancesRes.json();
    console.log('RAW Response:', JSON.stringify(instancesData, null, 2).substring(0, 500));

    const instances = instancesData.data || instancesData.instances || instancesData || [];

    console.log('\nInstâncias encontradas:', Array.isArray(instances) ? instances.length : 0);
    instances.forEach((inst, i) => {
      console.log(`  ${i+1}. ${inst.instanceName || inst.name} - Status: ${inst.status || 'unknown'} - Token: ${(inst.token || '').substring(0, 20)}...`);
    });

    // 2. Para cada instância conectada, buscar chats
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    BUSCANDO CHATS                             ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    for (const inst of instances) {
      const token = inst.token;
      if (!token) continue;

      console.log(`\n🔍 Instância: ${inst.instanceName || inst.name}`);
      console.log('   Token:', token.substring(0, 30) + '...');

      try {
        // Buscar chats desta instância
        const chatsRes = await fetch(`${UAZAPI_URL}/chats/all`, {
          method: 'GET',
          headers: {
            'token': token,
            'Content-Type': 'application/json'
          }
        });

        if (!chatsRes.ok) {
          console.log('   ⚠️ Erro ao buscar chats:', chatsRes.status);
          continue;
        }

        const chatsData = await chatsRes.json();
        const chats = chatsData.data || chatsData.chats || chatsData || [];

        // Filtrar por Ana Paula
        const anaChat = Array.isArray(chats) ? chats.find(c =>
          c.id?.includes(PHONE_NUMBER) ||
          c.wa_chatid?.includes(PHONE_NUMBER) ||
          c.chatid?.includes(PHONE_NUMBER)
        ) : null;

        if (anaChat) {
          console.log('\n   ✅ CHAT DA ANA PAULA ENCONTRADO!');
          console.log('   ────────────────────────────────────');
          console.log('   Chat ID:', anaChat.id || anaChat.wa_chatid || anaChat.chatid);
          console.log('   Nome:', anaChat.name || anaChat.wa_name || 'N/A');
          console.log('   Última msg:', anaChat.lastMessage || anaChat.wa_lastMsgBody || 'N/A');
          console.log('   Timestamp:', anaChat.wa_lastMsgTimestamp || anaChat.timestamp || 'N/A');
          console.log('   Unread:', anaChat.wa_unreadCount || anaChat.unreadCount || 0);
          console.log('   Profile Pic:', anaChat.wa_profilePicUrl || anaChat.profilePicUrl || 'N/A');
          console.log('');
          console.log('   RAW DATA:');
          console.log(JSON.stringify(anaChat, null, 2));

          // Buscar mensagens do chat usando POST /message/find
          console.log('\n   📨 Buscando mensagens...');
          const chatId = anaChat.id || anaChat.wa_chatid || anaChat.chatid;

          const msgsRes = await fetch(`${UAZAPI_URL}/message/find`, {
            method: 'POST',
            headers: {
              'token': token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              chatid: chatId,
              limit: 50,
              offset: 0
            })
          });

          if (msgsRes.ok) {
            const msgsData = await msgsRes.json();
            const msgs = msgsData.data || msgsData.messages || msgsData || [];

            console.log(`   Total de mensagens na UZAPI: ${Array.isArray(msgs) ? msgs.length : 'N/A'}`);

            if (Array.isArray(msgs) && msgs.length > 0) {
              console.log('\n   Últimas 10 mensagens:');
              const lastMsgs = msgs.slice(-10);
              lastMsgs.forEach((m, i) => {
                const fromMe = m.fromMe ? '→ [VOCÊ]' : '← [ANA]';
                const content = (m.body || m.content || m.text || `[${m.type || 'unknown'}]`).substring(0, 50);
                const timestamp = m.timestamp ? new Date(m.timestamp * 1000).toLocaleString('pt-BR') : 'N/A';
                console.log(`   ${i+1}. ${fromMe} ${timestamp}`);
                console.log(`      ${content}`);
              });
            }
          } else {
            console.log('   ⚠️ Erro ao buscar mensagens:', msgsRes.status);
          }

        } else {
          console.log(`   ℹ️ Chat da Ana Paula não encontrado nesta instância`);
          console.log(`   Total de chats: ${Array.isArray(chats) ? chats.length : 0}`);
        }

      } catch (e) {
        console.log('   ❌ Erro:', e.message);
      }
    }

  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
}

main();
