/**
 * Debug script to test findChats API endpoints
 * Run with: npx tsx scripts/debug-chats-api.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || process.env.UAZAPI_TOKEN || '';

async function main() {
  console.log('🔍 Debug: Chat Loading Issue\n');
  console.log('📌 Environment:');
  console.log(`   UAZAPI_BASE_URL: ${UAZAPI_BASE_URL}`);
  console.log(`   UAZAPI_ADMIN_TOKEN: ${UAZAPI_ADMIN_TOKEN ? UAZAPI_ADMIN_TOKEN.substring(0, 10) + '...' : '❌ NOT SET'}\n`);

  // 1. Find connected instances
  const instances = await prisma.connection.findMany({
    where: { status: 'CONNECTED' },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      uazapiToken: true,
      organizationId: true,
      status: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  console.log(`📱 Connected Instances: ${instances.length}`);

  if (instances.length === 0) {
    console.log('❌ No connected instances found!');
    return;
  }

  for (const inst of instances) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📱 Instance: ${inst.name} (${inst.phoneNumber || 'no phone'})`);
    console.log(`   ID: ${inst.id}`);
    console.log(`   OrganizationId: ${inst.organizationId || '❌ NULL'}`);
    console.log(`   Token: ${inst.uazapiToken ? inst.uazapiToken.substring(0, 10) + '...' : '❌ NULL'}`);

    if (!inst.uazapiToken) {
      console.log('   ⚠️  Skipping - no token');
      continue;
    }

    // 2. Count existing sessions
    const sessionCount = await prisma.chatSession.count({
      where: { connectionId: inst.id },
    });
    console.log(`   Sessions in DB: ${sessionCount}`);

    // 3. Try each endpoint
    const endpoints = [
      { method: 'POST', path: '/chat/findChats', body: { count: 10, limit: 10, page: 1 } },
      { method: 'GET', path: '/chat/findChats', body: null },
      { method: 'POST', path: '/chat/find', body: { count: 10, limit: 10, page: 1 } },
      { method: 'GET', path: '/chat/find', body: null },
    ];

    for (const ep of endpoints) {
      console.log(`\n   📡 Testing ${ep.method} ${ep.path}...`);
      try {
        const res = await fetch(`${UAZAPI_BASE_URL}${ep.path}`, {
          method: ep.method,
          headers: {
            'Content-Type': 'application/json',
            'token': inst.uazapiToken!,
            'apikey': UAZAPI_ADMIN_TOKEN,
          },
          body: ep.body ? JSON.stringify(ep.body) : undefined,
        });

        console.log(`      Status: ${res.status} ${res.statusText}`);

        if (res.ok) {
          const data = await res.json();

          // Analyze response structure
          const isArray = Array.isArray(data);
          const hasChatsArray = data && Array.isArray(data.chats);

          console.log(`      ✅ SUCCESS!`);
          console.log(`      Response type: ${typeof data}`);
          console.log(`      Is array: ${isArray}`);
          console.log(`      Has .chats array: ${hasChatsArray}`);

          const chats = isArray ? data : (hasChatsArray ? data.chats : []);
          console.log(`      Chats count: ${chats.length}`);

          if (chats.length > 0) {
            const sample = chats[0];
            console.log(`\n      📋 Sample chat structure:`);
            console.log(`         id: ${sample.id || '❌ null'} (type: ${typeof sample.id})`);
            console.log(`         chatId: ${sample.chatId || '❌ null'}`);
            console.log(`         name: ${sample.name || sample.formattedTitle || '❌ null'}`);
            console.log(`         lastMsgTimestamp: ${sample.lastMsgTimestamp || '❌ null'}`);

            // Show all keys
            console.log(`         All keys: ${Object.keys(sample).join(', ')}`);
          }

          // This endpoint works - no need to try others
          break;
        } else {
          const errorText = await res.text().catch(() => 'Unable to read error');
          console.log(`      ❌ Failed: ${errorText.substring(0, 200)}`);
        }
      } catch (e: any) {
        console.log(`      ❌ Exception: ${e.message}`);
      }
    }
  }

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Debug complete!');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
