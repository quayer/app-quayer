/**
 * Debug script to test ALL UAZapi send endpoints
 * Tests: text, media, audio
 *
 * Run with: npx tsx scripts/debug-send-all.ts
 *
 * Requires: UAZAPI_INSTANCE_TOKEN env variable (or will try to fetch from DB)
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || process.env.UAZAPI_TOKEN || '';
const UAZAPI_INSTANCE_TOKEN = process.env.UAZAPI_INSTANCE_TOKEN || ''; // Token da instância específica

// Número de teste
const TEST_NUMBER = '5512996269235'; // Formato E.164 Brasil
const TEST_CHAT_ID = `${TEST_NUMBER}@s.whatsapp.net`;

interface TestResult {
  endpoint: string;
  method: string;
  body: any;
  status: number;
  success: boolean;
  response: any;
  error?: string;
}

async function testEndpoint(
  token: string,
  method: string,
  path: string,
  body: any
): Promise<TestResult> {
  const result: TestResult = {
    endpoint: path,
    method,
    body,
    status: 0,
    success: false,
    response: null,
  };

  try {
    const res = await fetch(`${UAZAPI_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'token': token,
        'apikey': UAZAPI_ADMIN_TOKEN,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    result.status = res.status;

    const text = await res.text();
    try {
      result.response = JSON.parse(text);
    } catch {
      result.response = text.substring(0, 500);
    }

    result.success = res.status === 200 || res.status === 201;

  } catch (e: any) {
    result.error = e.message;
  }

  return result;
}

async function getInstanceToken(): Promise<string | null> {
  // 1. Try environment variable first
  if (UAZAPI_INSTANCE_TOKEN) {
    console.log('📱 Using token from UAZAPI_INSTANCE_TOKEN env variable');
    return UAZAPI_INSTANCE_TOKEN;
  }

  // 2. Try to list instances from UAZapi and pick first connected one
  console.log('🔍 Fetching instances from UAZapi...');
  try {
    const res = await fetch(`${UAZAPI_BASE_URL}/instance/all`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'admintoken': UAZAPI_ADMIN_TOKEN,
      },
    });

    if (!res.ok) {
      console.log(`❌ Failed to list instances: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const instances = Array.isArray(data) ? data : data.instances || data.data || [];

    console.log(`   Found ${instances.length} instances`);

    // Find first connected instance
    const connected = instances.find((i: any) =>
      i.status === 'connected' || i.status === 'CONNECTED' || i.connectionStatus === 'connected'
    );

    if (connected) {
      console.log(`📱 Using Instance: ${connected.name || connected.instanceName} (${connected.phoneNumber || 'no phone'})`);
      console.log(`   Status: ${connected.status || connected.connectionStatus}`);
      return connected.token || connected.instanceToken;
    }

    // If no connected, try first with token
    const withToken = instances.find((i: any) => i.token || i.instanceToken);
    if (withToken) {
      console.log(`📱 Using Instance (not connected): ${withToken.name || withToken.instanceName}`);
      return withToken.token || withToken.instanceToken;
    }

    console.log('❌ No instance with token found');
    return null;
  } catch (e: any) {
    console.log(`❌ Error fetching instances: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('🔍 Debug: Testing ALL Send Endpoints\n');
  console.log('📌 Configuration:');
  console.log(`   UAZAPI_BASE_URL: ${UAZAPI_BASE_URL}`);
  console.log(`   UAZAPI_ADMIN_TOKEN: ${UAZAPI_ADMIN_TOKEN ? UAZAPI_ADMIN_TOKEN.substring(0, 10) + '...' : '❌ NOT SET'}`);
  console.log(`   TEST_NUMBER: ${TEST_NUMBER}`);
  console.log(`   TEST_CHAT_ID: ${TEST_CHAT_ID}\n`);

  // 1. Get instance token
  const token = await getInstanceToken();

  if (!token) {
    console.log('\n❌ No instance token available!');
    console.log('   Set UAZAPI_INSTANCE_TOKEN env variable or ensure UAZAPI_ADMIN_TOKEN is set');
    return;
  }

  console.log(`   Token: ${token.substring(0, 10)}...\n`);
  const testMessage = `🧪 Teste Quayer - ${new Date().toLocaleTimeString('pt-BR')}`;

  // ============================================
  // TEST 1: TEXT MESSAGE ENDPOINTS
  // ============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 TESTING TEXT MESSAGE ENDPOINTS\n');

  const textEndpoints = [
    // Format 1: /message/send with number
    { method: 'POST', path: '/message/send', body: { number: TEST_NUMBER, text: testMessage } },
    // Format 2: /message/send with chatId
    { method: 'POST', path: '/message/send', body: { chatId: TEST_CHAT_ID, text: testMessage } },
    // Format 3: /send/text with number
    { method: 'POST', path: '/send/text', body: { number: TEST_NUMBER, text: testMessage } },
    // Format 4: /send/text with chatId
    { method: 'POST', path: '/send/text', body: { chatId: TEST_CHAT_ID, text: testMessage } },
    // Format 5: /message/text
    { method: 'POST', path: '/message/text', body: { number: TEST_NUMBER, text: testMessage } },
    // Format 6: /sendText
    { method: 'POST', path: '/sendText', body: { number: TEST_NUMBER, text: testMessage } },
    // Format 7: with 'to' field
    { method: 'POST', path: '/message/send', body: { to: TEST_NUMBER, text: testMessage } },
    // Format 8: with 'phone' and 'message' fields
    { method: 'POST', path: '/message/send', body: { phone: TEST_NUMBER, message: testMessage } },
    // Format 9: /chat/send
    { method: 'POST', path: '/chat/send', body: { chatId: TEST_CHAT_ID, text: testMessage } },
  ];

  let textSuccess: TestResult | null = null;

  for (const ep of textEndpoints) {
    const result = await testEndpoint(token, ep.method, ep.path, ep.body);
    const icon = result.success ? '✅' : result.status === 400 ? '⚠️' : '❌';

    console.log(`${icon} ${ep.method} ${ep.path}`);
    console.log(`   Body: ${JSON.stringify(ep.body)}`);
    console.log(`   Status: ${result.status}`);

    if (result.error) {
      console.log(`   Error: ${result.error}`);
    } else if (result.response) {
      const respStr = JSON.stringify(result.response);
      console.log(`   Response: ${respStr.substring(0, 200)}${respStr.length > 200 ? '...' : ''}`);
    }
    console.log('');

    if (result.success && !textSuccess) {
      textSuccess = result;
      console.log('🎉 FOUND WORKING TEXT ENDPOINT!\n');
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  // ============================================
  // TEST 2: MEDIA ENDPOINTS (Image)
  // ============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🖼️ TESTING MEDIA ENDPOINTS\n');

  // Using a public test image
  const testImageUrl = 'https://via.placeholder.com/150/0000FF/FFFFFF?text=Test';

  // Minimal 1x1 red PNG in base64
  const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

  const mediaEndpoints = [
    // Format 1: /send/media with number and media base64
    { method: 'POST', path: '/send/media', body: { number: TEST_NUMBER, media: `data:image/png;base64,${testImageBase64}`, mediatype: 'image', caption: 'Test' } },
    // Format 2: /send/media with number and file base64 (alternative field name)
    { method: 'POST', path: '/send/media', body: { number: TEST_NUMBER, file: `data:image/png;base64,${testImageBase64}`, mediatype: 'image' } },
    // Format 3: /send/media with number and base64 field
    { method: 'POST', path: '/send/media', body: { number: TEST_NUMBER, base64: `data:image/png;base64,${testImageBase64}`, mediatype: 'image' } },
    // Format 4: /send/media with image field
    { method: 'POST', path: '/send/media', body: { number: TEST_NUMBER, image: `data:image/png;base64,${testImageBase64}` } },
    // Format 5: /send/media with mediaUrl (URL to image)
    { method: 'POST', path: '/send/media', body: { number: TEST_NUMBER, mediaUrl: testImageUrl, mediatype: 'image' } },
    // Format 6: /send/media with url field
    { method: 'POST', path: '/send/media', body: { number: TEST_NUMBER, url: testImageUrl, mediatype: 'image' } },
  ];

  let mediaSuccess: TestResult | null = null;

  for (const ep of mediaEndpoints) {
    const result = await testEndpoint(token, ep.method, ep.path, ep.body);
    const icon = result.success ? '✅' : result.status === 400 ? '⚠️' : '❌';

    console.log(`${icon} ${ep.method} ${ep.path}`);
    console.log(`   Body: ${JSON.stringify(ep.body)}`);
    console.log(`   Status: ${result.status}`);

    if (result.error) {
      console.log(`   Error: ${result.error}`);
    } else if (result.response) {
      const respStr = JSON.stringify(result.response);
      console.log(`   Response: ${respStr.substring(0, 200)}${respStr.length > 200 ? '...' : ''}`);
    }
    console.log('');

    if (result.success && !mediaSuccess) {
      mediaSuccess = result;
      console.log('🎉 FOUND WORKING MEDIA ENDPOINT!\n');
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // ============================================
  // TEST 3: AUDIO ENDPOINTS
  // ============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎤 TESTING AUDIO ENDPOINTS\n');

  // Mini audio base64 (very short silent audio for testing)
  // This is a minimal valid WebM audio file
  const miniAudioBase64 = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAHTEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OssYKJcGNzAAAAAAABSJqJBXN0Y3MAIAAAB5cJ';

  const audioEndpoints = [
    // Format 1: /send/media with number and myaudio mediatype (voice message)
    {
      method: 'POST',
      path: '/send/media',
      body: {
        number: TEST_NUMBER,
        mediatype: 'myaudio',
        media: `data:audio/webm;base64,${miniAudioBase64}`
      }
    },
    // Format 2: /send/media with number and audio mediatype
    {
      method: 'POST',
      path: '/send/media',
      body: {
        number: TEST_NUMBER,
        mediatype: 'audio',
        media: `data:audio/webm;base64,${miniAudioBase64}`
      }
    },
    // Format 3: /send/media with ptt:true (push to talk)
    {
      method: 'POST',
      path: '/send/media',
      body: {
        number: TEST_NUMBER,
        mediatype: 'audio',
        media: `data:audio/webm;base64,${miniAudioBase64}`,
        ptt: true
      }
    },
    // Format 4: /send/media with file field
    {
      method: 'POST',
      path: '/send/media',
      body: {
        number: TEST_NUMBER,
        mediatype: 'myaudio',
        file: `data:audio/webm;base64,${miniAudioBase64}`
      }
    },
    // Format 5: /send/audio
    {
      method: 'POST',
      path: '/send/audio',
      body: {
        number: TEST_NUMBER,
        audio: `data:audio/webm;base64,${miniAudioBase64}`
      }
    },
  ];

  let audioSuccess: TestResult | null = null;

  for (const ep of audioEndpoints) {
    const result = await testEndpoint(token, ep.method, ep.path, ep.body);
    const icon = result.success ? '✅' : result.status === 400 ? '⚠️' : '❌';

    console.log(`${icon} ${ep.method} ${ep.path}`);
    // Don't log full base64
    const bodyLog = { ...ep.body };
    if (bodyLog.media) bodyLog.media = bodyLog.media.substring(0, 50) + '...';
    if (bodyLog.audio && bodyLog.audio.length > 50) bodyLog.audio = bodyLog.audio.substring(0, 50) + '...';
    console.log(`   Body: ${JSON.stringify(bodyLog)}`);
    console.log(`   Status: ${result.status}`);

    if (result.error) {
      console.log(`   Error: ${result.error}`);
    } else if (result.response) {
      const respStr = JSON.stringify(result.response);
      console.log(`   Response: ${respStr.substring(0, 200)}${respStr.length > 200 ? '...' : ''}`);
    }
    console.log('');

    if (result.success && !audioSuccess) {
      audioSuccess = result;
      console.log('🎉 FOUND WORKING AUDIO ENDPOINT!\n');
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY\n');

  if (textSuccess) {
    console.log('✅ TEXT MESSAGE:');
    console.log(`   Endpoint: ${textSuccess.method} ${textSuccess.endpoint}`);
    console.log(`   Body format: ${JSON.stringify(textSuccess.body)}\n`);
  } else {
    console.log('❌ TEXT MESSAGE: No working endpoint found\n');
  }

  if (mediaSuccess) {
    console.log('✅ MEDIA (IMAGE):');
    console.log(`   Endpoint: ${mediaSuccess.method} ${mediaSuccess.endpoint}`);
    console.log(`   Body format: ${JSON.stringify(mediaSuccess.body)}\n`);
  } else {
    console.log('❌ MEDIA (IMAGE): No working endpoint found\n');
  }

  if (audioSuccess) {
    console.log('✅ AUDIO:');
    console.log(`   Endpoint: ${audioSuccess.method} ${audioSuccess.endpoint}`);
    const bodyLog = { ...audioSuccess.body };
    if (bodyLog.media) bodyLog.media = '[base64]';
    if (bodyLog.audio) bodyLog.audio = '[base64]';
    console.log(`   Body format: ${JSON.stringify(bodyLog)}\n`);
  } else {
    console.log('❌ AUDIO: No working endpoint found\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Debug complete!');
}

main().catch(console.error);
