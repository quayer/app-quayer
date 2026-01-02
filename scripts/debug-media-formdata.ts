/**
 * Debug script to test UAZapi media endpoints with multipart/form-data
 * Run with: npx tsx scripts/debug-media-formdata.ts
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

async function testFormData(token: string, formData: FormData, endpoint: string, description: string) {
  console.log(`\n========================================`);
  console.log(`Testing: ${description}`);
  console.log(`Endpoint: POST ${endpoint}`);

  // Log form data fields
  const fields: string[] = [];
  formData.forEach((value, key) => {
    if (value instanceof Blob) {
      fields.push(`${key}: [Blob ${value.size} bytes, ${value.type}]`);
    } else {
      fields.push(`${key}: ${value}`);
    }
  });
  console.log(`Fields: ${fields.join(', ')}`);

  try {
    const res = await fetch(`${UAZAPI_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'token': token,
        // Note: Do NOT set Content-Type for form-data, browser/fetch will set it with boundary
      },
      body: formData,
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    console.log(`Status: ${res.status}`);
    console.log(`Response: ${JSON.stringify(data).substring(0, 300)}`);

    return res.status === 200 || res.status === 201;
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
    return false;
  }
}

async function createBlobFromBase64(base64: string, mimeType: string): Promise<Blob> {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

async function main() {
  console.log('Testing UAZapi /send/media with multipart/form-data\n');

  const token = await getToken();
  if (!token) {
    console.log('No token available');
    return;
  }
  console.log(`Token: ${token.substring(0, 10)}...`);

  const imageBlob = await createBlobFromBase64(PNG_BASE64, 'image/png');

  // Test 1: FormData with 'file' field as Blob
  {
    const formData = new FormData();
    formData.append('number', TEST_NUMBER);
    formData.append('mediatype', 'image');
    formData.append('file', imageBlob, 'test.png');
    await testFormData(token, formData, '/send/media', 'file as Blob with filename');
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 2: FormData with 'media' field as Blob
  {
    const formData = new FormData();
    formData.append('number', TEST_NUMBER);
    formData.append('mediatype', 'image');
    formData.append('media', imageBlob, 'test.png');
    await testFormData(token, formData, '/send/media', 'media as Blob with filename');
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 3: FormData with 'image' field as Blob
  {
    const formData = new FormData();
    formData.append('number', TEST_NUMBER);
    formData.append('image', imageBlob, 'test.png');
    await testFormData(token, formData, '/send/media', 'image as Blob');
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 4: FormData with base64 data URI
  {
    const formData = new FormData();
    formData.append('number', TEST_NUMBER);
    formData.append('mediatype', 'image');
    formData.append('file', `data:image/png;base64,${PNG_BASE64}`);
    await testFormData(token, formData, '/send/media', 'file as data URI string');
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 5: Try /send/image endpoint
  {
    const formData = new FormData();
    formData.append('number', TEST_NUMBER);
    formData.append('image', imageBlob, 'test.png');
    await testFormData(token, formData, '/send/image', '/send/image with image Blob');
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 6: Try /message/sendMedia endpoint
  {
    const formData = new FormData();
    formData.append('number', TEST_NUMBER);
    formData.append('mediatype', 'image');
    formData.append('file', imageBlob, 'test.png');
    await testFormData(token, formData, '/message/sendMedia', '/message/sendMedia with file');
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 7: Try Evolution API style endpoint /message/sendMedia/instanceName
  // First get instance name
  const instancesRes = await fetch(`${UAZAPI_BASE_URL}/instance/all`, {
    headers: { 'admintoken': UAZAPI_ADMIN_TOKEN },
  });
  const instancesData = await instancesRes.json();
  const instances = Array.isArray(instancesData) ? instancesData : instancesData.instances || [];
  const connected = instances.find((i: any) => i.status === 'connected');
  const instanceName = connected?.name || connected?.instanceName;

  if (instanceName) {
    const formData = new FormData();
    formData.append('number', TEST_NUMBER);
    formData.append('mediatype', 'image');
    formData.append('file', imageBlob, 'test.png');
    await testFormData(token, formData, `/message/sendMedia/${instanceName}`, `/message/sendMedia/${instanceName}`);
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 8: Try /sendMedia endpoint directly
  {
    const formData = new FormData();
    formData.append('number', TEST_NUMBER);
    formData.append('mediatype', 'image');
    formData.append('file', imageBlob, 'test.png');
    await testFormData(token, formData, '/sendMedia', '/sendMedia with file');
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 9: FormData with all fields including mimetype
  {
    const formData = new FormData();
    formData.append('number', TEST_NUMBER);
    formData.append('mediatype', 'image');
    formData.append('mimetype', 'image/png');
    formData.append('filename', 'test.png');
    formData.append('file', imageBlob, 'test.png');
    await testFormData(token, formData, '/send/media', 'file with all metadata');
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 10: Try with caption
  {
    const formData = new FormData();
    formData.append('number', TEST_NUMBER);
    formData.append('mediatype', 'image');
    formData.append('caption', 'Test image');
    formData.append('file', imageBlob, 'test.png');
    await testFormData(token, formData, '/send/media', 'file with caption');
  }

  console.log('\n========================================');
  console.log('Debug complete!');
}

main().catch(console.error);
