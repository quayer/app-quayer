/**
 * Confirm working media format and test all types
 * Run with: npx tsx scripts/debug-media-confirm.ts
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || process.env.UAZAPI_TOKEN || '';
const TEST_NUMBER = '5512996269235';

// Minimal valid PNG (1x1 pixel)
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const IMAGE_DATA_URI = `data:image/png;base64,${PNG_BASE64}`;

// Mini audio base64 (WebM)
const AUDIO_BASE64 = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAHTEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OssYKJcGNzAAAAAAABSJqJBXN0Y3MAIAAAB5cJ';
const AUDIO_DATA_URI = `data:audio/webm;base64,${AUDIO_BASE64}`;

// OGG audio (more compatible with WhatsApp voice messages)
const OGG_BASE64 = 'T2dnUwACAAAAAAAAAAAjkAkAAAAAAAA9FCoNAR9vcHVzIAAAAABPZ2dTAAAAAAAAAAAAAAA=';
const OGG_DATA_URI = `data:audio/ogg;codecs=opus;base64,${OGG_BASE64}`;

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
                    messageType.toLowerCase().includes('audio') ||
                    messageType.toLowerCase().includes('video') ||
                    messageType.toLowerCase().includes('document') ||
                    messageType.toLowerCase().includes('ptt');

    const icon = res.status === 200 || res.status === 201 ? (isMedia ? '✅' : '⚠️') : '❌';
    console.log(`${icon} Status: ${res.status} | MessageType: ${messageType}`);

    if (res.status === 200) {
      if (isMedia) {
        console.log(`   SUCCESS: Sent as ${messageType}!`);
      } else {
        console.log(`   WARNING: Sent as TEXT, not MEDIA!`);
      }
    }

    console.log(`Response: ${JSON.stringify(data).substring(0, 300)}`);

    return { success: res.status === 200 || res.status === 201, isMedia, messageType, data };
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
    return { success: false, isMedia: false, messageType: 'error' };
  }
}

async function main() {
  console.log('Confirming UAZapi Working Media Formats\n');
  console.log('='.repeat(60));

  const token = await getToken();
  if (!token) {
    console.log('No token available');
    return;
  }
  console.log(`Token: ${token.substring(0, 10)}...`);

  const results: { type: string; format: string; success: boolean; messageType: string }[] = [];

  // ===== IMAGE TESTS =====
  console.log('\n\n### IMAGE TESTS ###');

  // Confirmed working format: type + file
  const img1 = await testJson(token, {
    number: TEST_NUMBER,
    type: 'image',
    file: IMAGE_DATA_URI
  }, '/send/media', 'IMAGE: type:image + file (CONFIRMED WORKING)');
  results.push({ type: 'image', format: 'type + file', success: img1.isMedia, messageType: img1.messageType });

  await new Promise(r => setTimeout(r, 800));

  // Test with caption
  const img2 = await testJson(token, {
    number: TEST_NUMBER,
    type: 'image',
    file: IMAGE_DATA_URI,
    caption: 'Test caption'
  }, '/send/media', 'IMAGE: type:image + file + caption');
  results.push({ type: 'image+caption', format: 'type + file + caption', success: img2.isMedia, messageType: img2.messageType });

  await new Promise(r => setTimeout(r, 800));

  // ===== AUDIO TESTS =====
  console.log('\n\n### AUDIO TESTS ###');

  // type:audio + file
  const aud1 = await testJson(token, {
    number: TEST_NUMBER,
    type: 'audio',
    file: AUDIO_DATA_URI
  }, '/send/media', 'AUDIO: type:audio + file (WebM)');
  results.push({ type: 'audio', format: 'type:audio + file', success: aud1.isMedia, messageType: aud1.messageType });

  await new Promise(r => setTimeout(r, 800));

  // type:ptt (push to talk / voice message)
  const aud2 = await testJson(token, {
    number: TEST_NUMBER,
    type: 'ptt',
    file: AUDIO_DATA_URI
  }, '/send/media', 'AUDIO: type:ptt + file (voice message)');
  results.push({ type: 'ptt', format: 'type:ptt + file', success: aud2.isMedia, messageType: aud2.messageType });

  await new Promise(r => setTimeout(r, 800));

  // type:audio + ptt:true
  const aud3 = await testJson(token, {
    number: TEST_NUMBER,
    type: 'audio',
    file: AUDIO_DATA_URI,
    ptt: true
  }, '/send/media', 'AUDIO: type:audio + file + ptt:true');
  results.push({ type: 'audio+ptt', format: 'type:audio + ptt:true', success: aud3.isMedia, messageType: aud3.messageType });

  await new Promise(r => setTimeout(r, 800));

  // Try OGG format
  const aud4 = await testJson(token, {
    number: TEST_NUMBER,
    type: 'ptt',
    file: OGG_DATA_URI
  }, '/send/media', 'AUDIO: type:ptt + OGG format');
  results.push({ type: 'ptt-ogg', format: 'type:ptt + ogg', success: aud4.isMedia, messageType: aud4.messageType });

  await new Promise(r => setTimeout(r, 800));

  // ===== VIDEO TEST =====
  console.log('\n\n### VIDEO TEST ###');

  const vid1 = await testJson(token, {
    number: TEST_NUMBER,
    type: 'video',
    file: IMAGE_DATA_URI // Won't work but let's see the error
  }, '/send/media', 'VIDEO: type:video + file');
  results.push({ type: 'video', format: 'type:video + file', success: vid1.isMedia, messageType: vid1.messageType });

  await new Promise(r => setTimeout(r, 800));

  // ===== DOCUMENT TEST =====
  console.log('\n\n### DOCUMENT TEST ###');

  const doc1 = await testJson(token, {
    number: TEST_NUMBER,
    type: 'document',
    file: IMAGE_DATA_URI,
    filename: 'test.png'
  }, '/send/media', 'DOCUMENT: type:document + file + filename');
  results.push({ type: 'document', format: 'type:document + file + filename', success: doc1.isMedia, messageType: doc1.messageType });

  // ===== SUMMARY =====
  console.log('\n\n' + '='.repeat(60));
  console.log('SUMMARY OF WORKING FORMATS');
  console.log('='.repeat(60));

  const working = results.filter(r => r.success);
  const notWorking = results.filter(r => !r.success);

  console.log('\n✅ WORKING FORMATS:');
  if (working.length === 0) {
    console.log('   None found');
  } else {
    working.forEach(r => {
      console.log(`   - ${r.type}: ${r.format} -> ${r.messageType}`);
    });
  }

  console.log('\n❌ NOT WORKING:');
  if (notWorking.length === 0) {
    console.log('   All formats worked!');
  } else {
    notWorking.forEach(r => {
      console.log(`   - ${r.type}: ${r.format}`);
    });
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
