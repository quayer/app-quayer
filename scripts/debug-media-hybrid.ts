/**
 * Debug script to test UAZapi media endpoints with hybrid approaches
 * Tests: query params, URL params, and combinations
 * Run with: npx tsx scripts/debug-media-hybrid.ts
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

async function createBlobFromBase64(base64: string, mimeType: string): Promise<Blob> {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

async function testRequest(token: string, description: string, url: string, options: RequestInit) {
  console.log(`\n========================================`);
  console.log(`Testing: ${description}`);
  console.log(`URL: ${url}`);

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers as Record<string, string>,
        'token': token,
      },
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    console.log(`Status: ${res.status}`);
    console.log(`Response: ${JSON.stringify(data).substring(0, 400)}`);

    return res.status === 200 || res.status === 201;
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('Testing UAZapi /send/media with hybrid approaches\n');

  const token = await getToken();
  if (!token) {
    console.log('No token available');
    return;
  }
  console.log(`Token: ${token.substring(0, 10)}...`);

  const imageBlob = await createBlobFromBase64(PNG_BASE64, 'image/png');
  const dataUri = `data:image/png;base64,${PNG_BASE64}`;

  // Test 1: Query params + form-data file
  {
    const formData = new FormData();
    formData.append('file', imageBlob, 'test.png');
    await testRequest(token, 'Query params + form-data file',
      `${UAZAPI_BASE_URL}/send/media?number=${TEST_NUMBER}&mediatype=image`,
      { method: 'POST', body: formData }
    );
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 2: URL path param for number
  {
    const formData = new FormData();
    formData.append('mediatype', 'image');
    formData.append('file', imageBlob, 'test.png');
    await testRequest(token, 'Number in URL path',
      `${UAZAPI_BASE_URL}/send/media/${TEST_NUMBER}`,
      { method: 'POST', body: formData }
    );
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 3: Check if there's a different endpoint structure
  {
    await testRequest(token, 'GET /send endpoint info',
      `${UAZAPI_BASE_URL}/send`,
      { method: 'GET' }
    );
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 4: JSON with base64 but field named 'file'
  {
    await testRequest(token, 'JSON with file field containing base64',
      `${UAZAPI_BASE_URL}/send/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: TEST_NUMBER,
          mediatype: 'image',
          file: PNG_BASE64
        })
      }
    );
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 5: JSON with file field as data URI
  {
    await testRequest(token, 'JSON with file field as data URI',
      `${UAZAPI_BASE_URL}/send/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: TEST_NUMBER,
          mediatype: 'image',
          file: dataUri
        })
      }
    );
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 6: Try to discover API routes
  {
    await testRequest(token, 'API Discovery - OPTIONS /send/media',
      `${UAZAPI_BASE_URL}/send/media`,
      { method: 'OPTIONS' }
    );
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 7: Try /send/file endpoint
  {
    await testRequest(token, '/send/file with JSON',
      `${UAZAPI_BASE_URL}/send/file`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: TEST_NUMBER,
          file: dataUri,
          mediatype: 'image'
        })
      }
    );
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 8: Try /send/document endpoint for file
  {
    await testRequest(token, '/send/document with JSON',
      `${UAZAPI_BASE_URL}/send/document`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: TEST_NUMBER,
          file: dataUri,
          filename: 'test.png'
        })
      }
    );
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 9: Try URL-based media sending (common in some APIs)
  {
    await testRequest(token, 'Media via URL (imageUrl)',
      `${UAZAPI_BASE_URL}/send/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: TEST_NUMBER,
          mediatype: 'image',
          imageUrl: 'https://via.placeholder.com/150/0000FF/FFFFFF?text=Test'
        })
      }
    );
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 10: Check Evolution API compatibility
  {
    await testRequest(token, 'Evolution API style mediaMessage',
      `${UAZAPI_BASE_URL}/message/sendMedia`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: TEST_NUMBER,
          options: {
            delay: 0
          },
          mediaMessage: {
            mediatype: 'image',
            media: dataUri,
            caption: 'test'
          }
        })
      }
    );
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 11: Try with 'link' field for URL
  {
    await testRequest(token, 'Media via link field',
      `${UAZAPI_BASE_URL}/send/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: TEST_NUMBER,
          mediatype: 'image',
          link: 'https://via.placeholder.com/150/0000FF/FFFFFF?text=Test'
        })
      }
    );
  }

  console.log('\n========================================');
  console.log('Debug complete!');
}

main().catch(console.error);
