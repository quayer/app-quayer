/**
 * Debug script to discover correct media format for UAZapi
 * Run with: npx tsx scripts/debug-send-media.ts
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || process.env.UAZAPI_TOKEN || '';
const TEST_NUMBER = '5512996269235';

// Minimal 1x1 PNG
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

async function getToken(): Promise<string | null> {
  const res = await fetch(`${UAZAPI_BASE_URL}/instance/all`, {
    headers: { 'admintoken': UAZAPI_ADMIN_TOKEN },
  });
  const data = await res.json();
  const instances = Array.isArray(data) ? data : data.instances || [];
  const connected = instances.find((i: any) => i.status === 'connected');
  return connected?.token || null;
}

async function testMedia(token: string, body: any, description: string) {
  console.log(`\n📤 Testing: ${description}`);
  console.log(`   Body keys: ${Object.keys(body).join(', ')}`);

  try {
    const res = await fetch(`${UAZAPI_BASE_URL}/send/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': token,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    console.log(`   Status: ${res.status}`);
    console.log(`   Response: ${JSON.stringify(data).substring(0, 200)}`);

    return res.status === 200 || res.status === 201;
  } catch (e: any) {
    console.log(`   Error: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('🔍 Testing UAZapi /send/media formats\n');

  const token = await getToken();
  if (!token) {
    console.log('❌ No token available');
    return;
  }
  console.log(`📱 Token: ${token.substring(0, 10)}...`);

  const dataUri = `data:image/png;base64,${PNG_BASE64}`;

  // Test different body formats
  const tests = [
    // Format variations for "media" field
    { number: TEST_NUMBER, media: dataUri, mediatype: 'image' },
    { number: TEST_NUMBER, media: PNG_BASE64, mediatype: 'image' },

    // Format variations for "file" field
    { number: TEST_NUMBER, file: dataUri, mediatype: 'image' },
    { number: TEST_NUMBER, file: PNG_BASE64, mediatype: 'image' },

    // Format with mimetype
    { number: TEST_NUMBER, media: dataUri, mediatype: 'image', mimetype: 'image/png' },
    { number: TEST_NUMBER, file: dataUri, mediatype: 'image', mimetype: 'image/png' },

    // Format with filename
    { number: TEST_NUMBER, media: dataUri, mediatype: 'image', filename: 'test.png' },

    // Format with "image" field directly
    { number: TEST_NUMBER, image: dataUri },
    { number: TEST_NUMBER, image: PNG_BASE64 },

    // Format with base64 field
    { number: TEST_NUMBER, base64: dataUri, type: 'image' },
    { number: TEST_NUMBER, base64: PNG_BASE64, type: 'image' },

    // Evolution API style
    { number: TEST_NUMBER, mediaMessage: { image: { url: dataUri }, caption: 'test' } },

    // With chatId instead of number
    { chatId: `${TEST_NUMBER}@s.whatsapp.net`, media: dataUri, mediatype: 'image' },
  ];

  for (let i = 0; i < tests.length; i++) {
    const success = await testMedia(token, tests[i], `Format ${i + 1}`);
    if (success) {
      console.log('\n🎉 FOUND WORKING FORMAT!');
      console.log(JSON.stringify(tests[i], null, 2));
      break;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Debug complete!');
}

main().catch(console.error);
