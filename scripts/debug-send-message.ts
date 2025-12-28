/**
 * Debug script to test UAZapi send message endpoints
 * Run with: npx tsx scripts/debug-send-message.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || process.env.UAZAPI_TOKEN || '';

async function main() {
  console.log('🔍 Debug: Send Message Endpoints\n');
  console.log('📌 Environment:');
  console.log(`   UAZAPI_BASE_URL: ${UAZAPI_BASE_URL}`);
  console.log(`   UAZAPI_ADMIN_TOKEN: ${UAZAPI_ADMIN_TOKEN ? UAZAPI_ADMIN_TOKEN.substring(0, 10) + '...' : '❌ NOT SET'}\n`);

  // 1. Find connected instance
  const instance = await prisma.connection.findFirst({
    where: { status: 'CONNECTED', uazapiToken: { not: null } },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      uazapiToken: true,
    },
  });

  if (!instance || !instance.uazapiToken) {
    console.log('❌ No connected instance found!');
    return;
  }

  console.log(`📱 Using Instance: ${instance.name} (${instance.phoneNumber})`);
  console.log(`   Token: ${instance.uazapiToken.substring(0, 10)}...\n`);

  // Test number - use the instance's own number or a test number
  const testNumber = instance.phoneNumber || '5511999999999';
  const testText = 'Test message from debug script';

  // List of endpoints to try (based on common UAZapi patterns)
  const endpoints = [
    // Common patterns
    { method: 'POST', path: '/message/send', body: { number: testNumber, text: testText } },
    { method: 'POST', path: '/message/text', body: { number: testNumber, text: testText } },
    { method: 'POST', path: '/send/text', body: { number: testNumber, text: testText } },
    { method: 'POST', path: '/sendText', body: { number: testNumber, text: testText } },
    { method: 'POST', path: '/send-text', body: { number: testNumber, text: testText } },
    { method: 'POST', path: '/text/send', body: { number: testNumber, text: testText } },

    // With chatId format
    { method: 'POST', path: '/message/send', body: { chatId: `${testNumber}@s.whatsapp.net`, text: testText } },
    { method: 'POST', path: '/send/text', body: { chatId: `${testNumber}@s.whatsapp.net`, text: testText } },

    // Different body format (to/text)
    { method: 'POST', path: '/message/send', body: { to: testNumber, text: testText } },
    { method: 'POST', path: '/send/text', body: { to: testNumber, text: testText } },

    // With 'phone' instead of 'number'
    { method: 'POST', path: '/message/send', body: { phone: testNumber, text: testText } },
    { method: 'POST', path: '/send/text', body: { phone: testNumber, text: testText } },

    // Evolution API style endpoints
    { method: 'POST', path: `/message/sendText/${instance.id}`, body: { number: testNumber, text: testText } },
    { method: 'POST', path: `/chat/sendText/${instance.id}`, body: { number: testNumber, text: testText } },
  ];

  console.log('📡 Testing send message endpoints...\n');
  console.log('⚠️  NOTE: Not actually sending messages, just checking endpoint availability\n');

  for (const ep of endpoints) {
    try {
      // Use OPTIONS or HEAD to check if endpoint exists without actually sending
      const checkRes = await fetch(`${UAZAPI_BASE_URL}${ep.path}`, {
        method: 'OPTIONS',
        headers: {
          'Content-Type': 'application/json',
          'token': instance.uazapiToken,
          'apikey': UAZAPI_ADMIN_TOKEN,
        },
      });

      // Also try POST but with minimal validation by checking status only
      const postRes = await fetch(`${UAZAPI_BASE_URL}${ep.path}`, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          'token': instance.uazapiToken,
          'apikey': UAZAPI_ADMIN_TOKEN,
        },
        body: JSON.stringify(ep.body),
      });

      const status = postRes.status;
      const statusText = postRes.statusText;

      let resultText = '';
      try {
        resultText = await postRes.text();
      } catch {}

      const icon = status === 200 || status === 201 ? '✅' : status === 400 ? '⚠️' : '❌';

      console.log(`${icon} ${ep.method} ${ep.path}`);
      console.log(`   Body: ${JSON.stringify(ep.body)}`);
      console.log(`   Status: ${status} ${statusText}`);
      if (resultText && resultText.length < 200) {
        console.log(`   Response: ${resultText}`);
      }
      console.log('');

      // If success, we found the right endpoint!
      if (status === 200 || status === 201) {
        console.log('🎉 SUCCESS! Found working endpoint!');
        console.log(`   Endpoint: ${ep.method} ${ep.path}`);
        console.log(`   Body format: ${JSON.stringify(ep.body, null, 2)}`);
        break;
      }
    } catch (e: any) {
      console.log(`❌ ${ep.method} ${ep.path}`);
      console.log(`   Error: ${e.message}\n`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Debug complete!');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
