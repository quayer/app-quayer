/**
 * Force UAZapi to send actual media (not text)
 * Run with: npx tsx scripts/debug-media-force.ts
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || process.env.UAZAPI_TOKEN || '';
const TEST_NUMBER = '5512996269235';

// Minimal valid PNG (1x1 pixel)
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const DATA_URI = `data:image/png;base64,${PNG_BASE64}`;

// Mini audio base64 (WebM)
const AUDIO_BASE64 = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAHTEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OssYKJcGNzAAAAAAABSJqJBXN0Y3MAIAAAB5cJ';
const AUDIO_DATA_URI = `data:audio/webm;base64,${AUDIO_BASE64}`;

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

    const messageType = data?.messageType || 'unknown';
    const isMedia = messageType.toLowerCase().includes('image') ||
                    messageType.toLowerCase().includes('media') ||
                    messageType.toLowerCase().includes('audio') ||
                    messageType.toLowerCase().includes('video') ||
                    messageType.toLowerCase().includes('document');

    const icon = res.status === 200 || res.status === 201 ? (isMedia ? '✅' : '⚠️') : '❌';
    console.log(`${icon} Status: ${res.status} | MessageType: ${messageType}`);
    if (res.status === 200 && !isMedia) {
      console.log(`   WARNING: Sent as TEXT, not MEDIA!`);
    }
    console.log(`Response: ${JSON.stringify(data).substring(0, 300)}`);

    return { success: res.status === 200 || res.status === 201, isMedia, data };
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
    return { success: false, isMedia: false };
  }
}

async function main() {
  console.log('Forcing UAZapi Media Send\n');

  const token = await getToken();
  if (!token) {
    console.log('No token available');
    return;
  }
  console.log(`Token: ${token.substring(0, 10)}...`);

  // Test 1: mediatype: 'image' with file (no text)
  await testJson(token, {
    number: TEST_NUMBER,
    mediatype: 'image',
    file: DATA_URI
  }, '/send/media', 'mediatype:image + file (no text)');

  await new Promise(r => setTimeout(r, 500));

  // Test 2: mediatype: 'image' with media field
  await testJson(token, {
    number: TEST_NUMBER,
    mediatype: 'image',
    media: DATA_URI
  }, '/send/media', 'mediatype:image + media');

  await new Promise(r => setTimeout(r, 500));

  // Test 3: type: 'image' instead of mediatype
  await testJson(token, {
    number: TEST_NUMBER,
    type: 'image',
    file: DATA_URI
  }, '/send/media', 'type:image + file');

  await new Promise(r => setTimeout(r, 500));

  // Test 4: Try sendType field
  await testJson(token, {
    number: TEST_NUMBER,
    sendType: 'image',
    file: DATA_URI
  }, '/send/media', 'sendType:image + file');

  await new Promise(r => setTimeout(r, 500));

  // Test 5: No text field at all, only mediatype and file
  await testJson(token, {
    number: TEST_NUMBER,
    mediatype: 'document',
    file: DATA_URI,
    filename: 'test.png',
    mimetype: 'image/png'
  }, '/send/media', 'mediatype:document with filename/mimetype');

  await new Promise(r => setTimeout(r, 500));

  // Test 6: Try audio with ptt
  await testJson(token, {
    number: TEST_NUMBER,
    mediatype: 'audio',
    file: AUDIO_DATA_URI,
    ptt: true
  }, '/send/media', 'audio with ptt:true');

  await new Promise(r => setTimeout(r, 500));

  // Test 7: Try audio with myaudio type
  await testJson(token, {
    number: TEST_NUMBER,
    mediatype: 'myaudio',
    file: AUDIO_DATA_URI
  }, '/send/media', 'myaudio type');

  await new Promise(r => setTimeout(r, 500));

  // Test 8: Base64 without data: prefix
  await testJson(token, {
    number: TEST_NUMBER,
    mediatype: 'image',
    file: PNG_BASE64,
    mimetype: 'image/png'
  }, '/send/media', 'file as raw base64 + mimetype');

  await new Promise(r => setTimeout(r, 500));

  // Test 9: Try buffer-style object
  await testJson(token, {
    number: TEST_NUMBER,
    mediatype: 'image',
    file: {
      data: PNG_BASE64,
      mimetype: 'image/png',
      filename: 'test.png'
    }
  }, '/send/media', 'file as object {data, mimetype, filename}');

  await new Promise(r => setTimeout(r, 500));

  // Test 10: Evolution API v2 style
  await testJson(token, {
    number: TEST_NUMBER + '@s.whatsapp.net',
    mediatype: 'image',
    media: DATA_URI,
    fileName: 'test.png'
  }, '/send/media', 'Evolution v2 style with @s.whatsapp.net');

  await new Promise(r => setTimeout(r, 500));

  // Test 11: Try with isMedia flag
  await testJson(token, {
    number: TEST_NUMBER,
    file: DATA_URI,
    isMedia: true,
    mediatype: 'image'
  }, '/send/media', 'isMedia:true flag');

  await new Promise(r => setTimeout(r, 500));

  // Test 12: URL based (known working in some APIs)
  await testJson(token, {
    number: TEST_NUMBER,
    mediatype: 'image',
    mediaUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Good_Food_Display_-_NCI_Visuals_Online.jpg/1200px-Good_Food_Display_-_NCI_Visuals_Online.jpg'
  }, '/send/media', 'mediaUrl field with real image');

  console.log('\n========================================');
  console.log('Debug complete!');
}

main().catch(console.error);
