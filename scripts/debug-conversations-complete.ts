/**
 * Debug script completo para investigar o problema de conversas não aparecendo
 * Run with: npx tsx scripts/debug-conversations-complete.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || process.env.UAZAPI_TOKEN || '';

interface DebugResult {
  step: string;
  status: 'OK' | 'WARNING' | 'ERROR';
  message: string;
  data?: any;
}

const results: DebugResult[] = [];

function log(step: string, status: 'OK' | 'WARNING' | 'ERROR', message: string, data?: any) {
  const emoji = status === 'OK' ? '✅' : status === 'WARNING' ? '⚠️' : '❌';
  console.log(`\n${emoji} [${step}] ${message}`);
  if (data) {
    console.log('   Data:', JSON.stringify(data, null, 2).split('\n').map(l => '   ' + l).join('\n'));
  }
  results.push({ step, status, message, data });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 DEBUG COMPLETO: Problema de Conversas Não Aparecendo');
  console.log('═══════════════════════════════════════════════════════════════');

  console.log('\n📌 Ambiente:');
  console.log(`   UAZAPI_BASE_URL: ${UAZAPI_BASE_URL}`);
  console.log(`   UAZAPI_ADMIN_TOKEN: ${UAZAPI_ADMIN_TOKEN ? UAZAPI_ADMIN_TOKEN.substring(0, 15) + '...' : '❌ NÃO CONFIGURADO'}`);

  // ══════════════════════════════════════════════════════════════════
  // STEP 1: Verificar organização "Gabriel Rizzatto"
  // ══════════════════════════════════════════════════════════════════
  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('STEP 1: Verificar Organização');
  console.log('══════════════════════════════════════════════════════════════');

  const organizations = await prisma.organization.findMany({
    where: {
      OR: [
        { name: { contains: 'Gabriel', mode: 'insensitive' } },
        { name: { contains: 'Rizzatto', mode: 'insensitive' } },
      ]
    },
    include: {
      users: {
        include: {
          user: { select: { id: true, email: true, name: true } }
        }
      }
    }
  });

  if (organizations.length === 0) {
    log('STEP 1', 'ERROR', 'Organização "Gabriel Rizzatto" não encontrada');
  } else {
    for (const org of organizations) {
      log('STEP 1', 'OK', `Organização encontrada: ${org.name}`, {
        id: org.id,
        name: org.name,
        users: org.users.map(u => ({ userId: u.userId, role: u.role, email: u.user.email }))
      });
    }
  }

  const targetOrgId = organizations[0]?.id;

  // ══════════════════════════════════════════════════════════════════
  // STEP 2: Verificar instância "Quayer Tech Antigravtiy"
  // ══════════════════════════════════════════════════════════════════
  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('STEP 2: Verificar Instância');
  console.log('══════════════════════════════════════════════════════════════');

  const instances = await prisma.connection.findMany({
    where: {
      OR: [
        { name: { contains: 'Quayer', mode: 'insensitive' } },
        { name: { contains: 'Antigravtiy', mode: 'insensitive' } },
        ...(targetOrgId ? [{ organizationId: targetOrgId }] : [])
      ]
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      status: true,
      uazapiToken: true,
      organizationId: true,
      createdAt: true,
      updatedAt: true,
    }
  });

  if (instances.length === 0) {
    log('STEP 2', 'ERROR', 'Nenhuma instância encontrada');
  } else {
    for (const inst of instances) {
      const statusOk = inst.status === 'CONNECTED';
      const hasToken = !!inst.uazapiToken;
      const hasOrgId = !!inst.organizationId;

      log('STEP 2', statusOk && hasToken && hasOrgId ? 'OK' : 'WARNING',
        `Instância: ${inst.name}`, {
        id: inst.id,
        status: inst.status,
        hasToken: hasToken,
        tokenPreview: inst.uazapiToken ? inst.uazapiToken.substring(0, 15) + '...' : null,
        organizationId: inst.organizationId,
        phoneNumber: inst.phoneNumber,
        updatedAt: inst.updatedAt,
      });

      if (!statusOk) {
        log('STEP 2', 'ERROR', `Instância NÃO está conectada. Status: ${inst.status}`);
      }
      if (!hasToken) {
        log('STEP 2', 'ERROR', 'Instância NÃO tem uazapiToken configurado');
      }
      if (!hasOrgId) {
        log('STEP 2', 'ERROR', 'Instância NÃO tem organizationId');
      }
    }
  }

  const targetInstance = instances.find(i => i.status === 'CONNECTED' && i.uazapiToken);

  if (!targetInstance) {
    log('STEP 2', 'ERROR', 'Nenhuma instância conectada com token encontrada');
    return summarize();
  }

  // ══════════════════════════════════════════════════════════════════
  // STEP 3: Testar UAZapi diretamente
  // ══════════════════════════════════════════════════════════════════
  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('STEP 3: Testar UAZapi diretamente');
  console.log('══════════════════════════════════════════════════════════════');

  const endpoints = [
    { method: 'POST', path: '/chat/find', body: {} },
    { method: 'POST', path: '/chat/findChats', body: {} },
    { method: 'GET', path: '/chat/findChats', body: null },
  ];

  let uazChats: any[] = [];
  let workingEndpoint: string | null = null;

  for (const ep of endpoints) {
    console.log(`\n   Testando ${ep.method} ${ep.path}...`);
    try {
      const res = await fetch(`${UAZAPI_BASE_URL}${ep.path}`, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          'token': targetInstance.uazapiToken!,
          'apikey': UAZAPI_ADMIN_TOKEN,
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });

      console.log(`   Status: ${res.status}`);

      if (res.ok) {
        const data = await res.json();
        const chats = Array.isArray(data) ? data : (data?.chats || []);

        if (chats.length > 0) {
          uazChats = chats;
          workingEndpoint = `${ep.method} ${ep.path}`;
          log('STEP 3', 'OK', `UAZapi retornou ${chats.length} chats via ${workingEndpoint}`);

          // Mostrar estrutura do primeiro chat
          const sample = chats[0];
          console.log('\n   📋 Estrutura do primeiro chat:');
          console.log(`      wa_chatid: ${sample.wa_chatid || '❌ NULL'}`);
          console.log(`      id: ${sample.id || '❌ NULL'}`);
          console.log(`      chatId: ${sample.chatId || '❌ NULL'}`);
          console.log(`      wa_name: ${sample.wa_name || '❌ NULL'}`);
          console.log(`      name: ${sample.name || '❌ NULL'}`);
          console.log(`      imagePreview: ${sample.imagePreview ? '✅ TEM' : '❌ NULL'}`);
          console.log(`      wa_lastMsgTimestamp: ${sample.wa_lastMsgTimestamp || '❌ NULL'}`);
          console.log(`      Keys: ${Object.keys(sample).join(', ')}`);
          break;
        } else {
          log('STEP 3', 'WARNING', `${ep.method} ${ep.path} retornou array vazio`);
        }
      } else {
        const errorText = await res.text().catch(() => '');
        console.log(`   Erro: ${errorText.substring(0, 200)}`);
      }
    } catch (e: any) {
      console.log(`   Exception: ${e.message}`);
    }
  }

  if (uazChats.length === 0) {
    log('STEP 3', 'ERROR', 'UAZapi não retornou nenhum chat em nenhum endpoint');
  }

  // ══════════════════════════════════════════════════════════════════
  // STEP 4: Verificar Contatos no banco
  // ══════════════════════════════════════════════════════════════════
  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('STEP 4: Verificar Contatos no banco');
  console.log('══════════════════════════════════════════════════════════════');

  // Extrair phoneNumbers do UAZapi
  const uazPhoneNumbers = uazChats
    .map(c => c.wa_chatid || c.chatId || c.id)
    .filter(Boolean)
    .slice(0, 10); // Primeiros 10 para amostra

  console.log(`\n   Primeiros 10 phoneNumbers do UAZapi:`);
  uazPhoneNumbers.forEach((p, i) => console.log(`   ${i + 1}. ${p}`));

  // Buscar no banco
  const contactsInDb = await prisma.contact.findMany({
    where: {
      phoneNumber: { in: uazPhoneNumbers }
    },
    select: {
      id: true,
      phoneNumber: true,
      name: true,
      organizationId: true,
    }
  });

  if (contactsInDb.length === 0) {
    log('STEP 4', 'ERROR', `Nenhum dos ${uazPhoneNumbers.length} contatos do UAZapi existe no banco`);
  } else {
    log('STEP 4', contactsInDb.length === uazPhoneNumbers.length ? 'OK' : 'WARNING',
      `${contactsInDb.length}/${uazPhoneNumbers.length} contatos encontrados no banco`, {
        sample: contactsInDb.slice(0, 3)
      });
  }

  // Total de contatos
  const totalContacts = await prisma.contact.count({
    where: { organizationId: targetOrgId }
  });
  console.log(`\n   Total de contatos na organização: ${totalContacts}`);

  // ══════════════════════════════════════════════════════════════════
  // STEP 5: Verificar ChatSessions no banco
  // ══════════════════════════════════════════════════════════════════
  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('STEP 5: Verificar ChatSessions no banco');
  console.log('══════════════════════════════════════════════════════════════');

  // Sessões para a instância
  const sessionsForInstance = await prisma.chatSession.count({
    where: { connectionId: targetInstance.id }
  });

  log('STEP 5', sessionsForInstance > 0 ? 'OK' : 'ERROR',
    `Sessões para instância ${targetInstance.name}: ${sessionsForInstance}`);

  // Sessões para a organização
  const sessionsForOrg = await prisma.chatSession.count({
    where: { organizationId: targetOrgId }
  });
  console.log(`   Sessões na organização: ${sessionsForOrg}`);

  // Sessões ativas
  const activeSessions = await prisma.chatSession.findMany({
    where: {
      connectionId: targetInstance.id,
      status: 'ACTIVE'
    },
    include: {
      contact: { select: { phoneNumber: true, name: true } }
    },
    take: 5,
    orderBy: { lastMessageAt: 'desc' }
  });

  if (activeSessions.length > 0) {
    console.log('\n   Últimas 5 sessões ativas:');
    activeSessions.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.contact?.phoneNumber || 'N/A'} - ${s.contact?.name || 'N/A'} (${s.status})`);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // STEP 6: Verificar se contatos do UAZapi têm sessões
  // ══════════════════════════════════════════════════════════════════
  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('STEP 6: Verificar relacionamento Contact -> Session');
  console.log('══════════════════════════════════════════════════════════════');

  if (contactsInDb.length > 0) {
    const contactIds = contactsInDb.map(c => c.id);
    const sessionsForContacts = await prisma.chatSession.findMany({
      where: {
        contactId: { in: contactIds },
        connectionId: targetInstance.id
      },
      select: {
        id: true,
        contactId: true,
        status: true,
        contact: { select: { phoneNumber: true } }
      }
    });

    if (sessionsForContacts.length === 0) {
      log('STEP 6', 'ERROR', 'Contatos existem mas NÃO têm sessões vinculadas');
    } else {
      log('STEP 6', 'OK', `${sessionsForContacts.length}/${contactsInDb.length} contatos têm sessões`);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // STEP 7: Simular query do frontend
  // ══════════════════════════════════════════════════════════════════
  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('STEP 7: Simular query do /chats/list');
  console.log('══════════════════════════════════════════════════════════════');

  const where = {
    connectionId: targetInstance.id,
  };

  console.log('\n   Query WHERE:', JSON.stringify(where, null, 2));

  const simulatedSessions = await prisma.chatSession.findMany({
    where,
    include: {
      contact: true,
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' as const },
      },
    },
    orderBy: { lastMessageAt: 'desc' as const },
    take: 20,
  });

  if (simulatedSessions.length === 0) {
    log('STEP 7', 'ERROR', 'Query simulada retornou 0 sessões');
  } else {
    log('STEP 7', 'OK', `Query simulada retornou ${simulatedSessions.length} sessões`);
    console.log('\n   Primeiras 5 sessões:');
    simulatedSessions.slice(0, 5).forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.contact?.phoneNumber} - ${s.contact?.name} (${s.status})`);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // STEP 8: Verificar se o sync está criando dados corretamente
  // ══════════════════════════════════════════════════════════════════
  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('STEP 8: Tentar criar contatos e sessões manualmente');
  console.log('══════════════════════════════════════════════════════════════');

  if (uazChats.length > 0 && sessionsForInstance === 0) {
    log('STEP 8', 'WARNING', 'UAZapi tem chats mas banco não tem sessões - PROBLEMA NO SYNC!');

    console.log('\n   🔧 Tentando criar manualmente...');

    const sampleChat = uazChats[0];
    const phoneNumber = sampleChat.wa_chatid || sampleChat.chatId || sampleChat.id;

    if (phoneNumber) {
      // Verificar/criar contato
      let contact = await prisma.contact.findFirst({
        where: { phoneNumber }
      });

      if (!contact) {
        console.log(`   Criando contato: ${phoneNumber}`);
        contact = await prisma.contact.create({
          data: {
            phoneNumber,
            name: sampleChat.wa_name || sampleChat.name || phoneNumber,
            profilePicUrl: sampleChat.imagePreview || null,
            organizationId: targetOrgId,
            source: targetInstance.id,
          }
        });
        console.log(`   ✅ Contato criado: ${contact.id}`);
      } else {
        console.log(`   Contato já existe: ${contact.id}`);
      }

      // Verificar/criar sessão
      let session = await prisma.chatSession.findFirst({
        where: {
          contactId: contact.id,
          connectionId: targetInstance.id
        }
      });

      if (!session) {
        console.log(`   Criando sessão para contato ${contact.id}`);
        const ts = Number(sampleChat.wa_lastMsgTimestamp || sampleChat.lastMsgTimestamp);
        session = await prisma.chatSession.create({
          data: {
            connectionId: targetInstance.id,
            contactId: contact.id,
            organizationId: targetOrgId,
            status: 'ACTIVE',
            lastMessageAt: !isNaN(ts) && ts > 0 ? new Date(ts) : new Date(),
            customerJourney: 'new',
          }
        });
        console.log(`   ✅ Sessão criada: ${session.id}`);
      } else {
        console.log(`   Sessão já existe: ${session.id}`);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════
  return summarize();
}

function summarize() {
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('📊 RESUMO DOS RESULTADOS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const errors = results.filter(r => r.status === 'ERROR');
  const warnings = results.filter(r => r.status === 'WARNING');
  const oks = results.filter(r => r.status === 'OK');

  console.log(`✅ OK: ${oks.length}`);
  console.log(`⚠️  Warnings: ${warnings.length}`);
  console.log(`❌ Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n❌ ERROS ENCONTRADOS:');
    errors.forEach(e => {
      console.log(`   - [${e.step}] ${e.message}`);
    });
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  AVISOS:');
    warnings.forEach(w => {
      console.log(`   - [${w.step}] ${w.message}`);
    });
  }

  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('🔧 POSSÍVEIS SOLUÇÕES:');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Diagnóstico baseado nos erros
  const hasNoSessions = errors.some(e => e.message.includes('0 sessões') || e.message.includes('NÃO têm sessões'));
  const hasUazChats = results.some(r => r.step === 'STEP 3' && r.status === 'OK');
  const hasContacts = results.some(r => r.step === 'STEP 4' && r.status !== 'ERROR');

  if (hasUazChats && hasNoSessions) {
    console.log('🔴 PROBLEMA IDENTIFICADO: UAZapi tem chats mas não há sessões no banco');
    console.log('   CAUSA PROVÁVEL: O sync não está sendo executado ou está falhando silenciosamente');
    console.log('   SOLUÇÃO: Verificar a lógica de runSync() no chats.controller.ts');
    console.log('   - Verificar se instance.uazapiToken está correto');
    console.log('   - Verificar se instance.status === "CONNECTED"');
    console.log('   - Verificar se organizationId está sendo passado corretamente');
  }

  if (!hasContacts && hasUazChats) {
    console.log('🔴 PROBLEMA IDENTIFICADO: UAZapi tem chats mas contatos não foram criados');
    console.log('   CAUSA PROVÁVEL: createMany com skipDuplicates pode estar falhando');
    console.log('   SOLUÇÃO: Verificar erros de constraint no banco');
  }

  console.log('\n');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
