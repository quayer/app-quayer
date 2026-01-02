/**
 * Final debug script to test UAZapi media with text field workaround
 * Run with: npx tsx scripts/debug-media-final.ts
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || process.env.UAZAPI_TOKEN || '';
const TEST_NUMBER = '5512996269235';

// Minimal 1x1 PNG
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const DATA_URI = `data:image/png;base64,${PNG_BASE64}`;

async function getToken(): Promise<string | null> {
  const res = await fetch(`${UAZAPI_BASE_URL}/instance/all`, {
    headers: { 'admintoken': UAZAPI_ADMIN_TOKEN },
  });
  const data = await res.json();
  const instances = Array.isArray(data) ? data : data.instances || [];
  const connected = instances.find((i: any) => i.status === 'connected');
  return connected?.token || null;
}

async function testJson(token: string, body: any, endpoint: string, description: string) {
  console.log(`\n========================================`);
  console.log(`Testing: ${description}`);
  console.log(`Endpoint: POST ${endpoint}`);
  console.log(`Body keys: ${Object.keys(body).join(', ')}`);

  try {
    const res = await fetch(`${UAZAPI_BASE_URL}${endpoint}`, {
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

    const icon = res.status === 200 || res.status === 201 ? '✅' : '❌';
    console.log(`${icon} Status: ${res.status}`);
    console.log(`Response: ${JSON.stringify(data).substring(0, 400)}`);

    return res.status === 200 || res.status === 201;
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('Final UAZapi Media Testing\n');

  const token = await getToken();
  if (!token) {
    console.log('No token available');
    return;
  }
  console.log(`Token: ${token.substring(0, 10)}...`);

  // Test 1: file + text (empty)
  await testJson(token, {
    number: TEST_NUMBER,
    file: DATA_URI,
    text: ''
  }, '/send/media', 'file + empty text');

  await new Promise(r => setTimeout(r, 500));

  // Test 2: file + text (with content)
  await testJson(token, {
    number: TEST_NUMBER,
    file: DATA_URI,
    text: 'Test image'
  }, '/send/media', 'file + text content');

  await new Promise(r => setTimeout(r, 500));

  // Test 3: file + text + mediatype
  await testJson(token, {
    number: TEST_NUMBER,
    file: DATA_URI,
    text: 'Test',
    mediatype: 'image'
  }, '/send/media', 'file + text + mediatype');

  await new Promise(r => setTimeout(r, 500));

  // Test 4: Just base64 in file (no data: prefix)
  await testJson(token, {
    number: TEST_NUMBER,
    file: PNG_BASE64,
    text: 'Test'
  }, '/send/media', 'file as raw base64 + text');

  await new Promise(r => setTimeout(r, 500));

  // Test 5: Try caption instead of text
  await testJson(token, {
    number: TEST_NUMBER,
    file: DATA_URI,
    caption: 'Test caption'
  }, '/send/media', 'file + caption');

  await new Promise(r => setTimeout(r, 500));

  // Test 6: Check if there's a specific image endpoint
  await testJson(token, {
    number: TEST_NUMBER,
    image: DATA_URI,
    caption: 'Test'
  }, '/send/image', '/send/image endpoint');

  await new Promise(r => setTimeout(r, 500));

  // Test 7: Try sticker endpoint
  await testJson(token, {
    number: TEST_NUMBER,
    sticker: DATA_URI
  }, '/send/sticker', '/send/sticker endpoint');

  await new Promise(r => setTimeout(r, 500));

  // Test 8: Try with URL to real image
  await testJson(token, {
    number: TEST_NUMBER,
    file: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png',
    text: 'URL test'
  }, '/send/media', 'file as URL + text');

  await new Promise(r => setTimeout(r, 500));

  // Test 9: media field with URL
  await testJson(token, {
    number: TEST_NUMBER,
    media: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png',
    mediatype: 'image',
    caption: 'URL test'
  }, '/send/media', 'media as URL');

  await new Promise(r => setTimeout(r, 500));

  // Test 10: Check what the /chat/sendMedia expects
  await testJson(token, {
    number: TEST_NUMBER,
    mediatype: 'image',
    media: DATA_URI
  }, '/chat/sendMedia', '/chat/sendMedia');

  await new Promise(r => setTimeout(r, 500));

  // Test 11: Try with 'url' field specifically
  await testJson(token, {
    number: TEST_NUMBER,
    url: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png',
    mediatype: 'image'
  }, '/send/media', 'url field');

  await new Promise(r => setTimeout(r, 500));

  // Test 12: Try message/send for media
  await testJson(token, {
    number: TEST_NUMBER,
    type: 'image',
    media: DATA_URI
  }, '/message/send', '/message/send with image type');

  console.log('\n========================================');
  console.log('Debug complete!');
}

main().catch(console.error);
