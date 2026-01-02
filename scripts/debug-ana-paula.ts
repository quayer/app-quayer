/**
 * Debug Script - Mensagens da Ana Paula
 *
 * Uso: npx tsx scripts/debug-ana-paula.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Buscando mensagens da Ana Paula (5511992222753)...\n');

  // 1. Buscar contato
  const contact = await prisma.contact.findFirst({
    where: {
      OR: [
        { phoneNumber: '5511992222753' },
        { phoneNumber: '5511992222753@s.whatsapp.net' },
        { phoneNumber: { contains: '992222753' } },
      ],
    },
  });

  if (!contact) {
    console.log('❌ Contato não encontrado');
    return;
  }

  console.log('✅ Contato encontrado:');
  console.log(`   ID: ${contact.id}`);
  console.log(`   Nome: ${contact.name}`);
  console.log(`   Telefone: ${contact.phoneNumber}`);
  console.log('');

  // 2. Buscar sessões do contato
  const sessions = await prisma.chatSession.findMany({
    where: { contactId: contact.id },
    orderBy: { lastMessageAt: 'desc' },
  });

  console.log(`📋 Sessões encontradas: ${sessions.length}`);
  sessions.forEach((s, i) => {
    console.log(`   ${i + 1}. ID: ${s.id} | Status: ${s.status} | Última msg: ${s.lastMessageAt}`);
  });
  console.log('');

  // 3. Buscar mensagens
  const messages = await prisma.message.findMany({
    where: { contactId: contact.id },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  console.log(`💬 Mensagens encontradas: ${messages.length}\n`);

  // Estatísticas
  const inbound = messages.filter(m => m.direction === 'INBOUND').length;
  const outbound = messages.filter(m => m.direction === 'OUTBOUND').length;
  const audios = messages.filter(m => m.type === 'audio' || m.type === 'voice' || m.type === 'ptt').length;
  const images = messages.filter(m => m.type === 'image').length;

  console.log('📊 Estatísticas:');
  console.log(`   INBOUND (dela): ${inbound}`);
  console.log(`   OUTBOUND (suas): ${outbound}`);
  console.log(`   Áudios: ${audios}`);
  console.log(`   Imagens: ${images}`);
  console.log('');

  // Listar mensagens
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                        HISTÓRICO DE MENSAGENS                  ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  messages.forEach((msg, i) => {
    const arrow = msg.direction === 'OUTBOUND' ? '→' : '←';
    const side = msg.direction === 'OUTBOUND' ? '[VOCÊ]' : '[ANA PAULA]';
    const date = new Date(msg.createdAt).toLocaleString('pt-BR');
    const content = msg.content?.substring(0, 60) || `[${msg.type}]`;
    const hasMedia = msg.mediaUrl ? '📎' : '';

    console.log(`${i + 1}. ${arrow} ${side} ${date}`);
    console.log(`   Tipo: ${msg.type} | Status: ${msg.status} ${hasMedia}`);
    console.log(`   Conteúdo: ${content}`);
    if (msg.mediaUrl) {
      console.log(`   Mídia: ${msg.mediaUrl.substring(0, 80)}...`);
    }
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════════════');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
