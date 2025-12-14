
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Debugging Chat Sync...');

    // 1. Get Instance
    const instance = await prisma.connection.findFirst({
        where: { status: 'CONNECTED' },
        orderBy: { updatedAt: 'desc' }
    });

    if (!instance) {
        console.log('❌ No CONNECTED instance found in DB.');
        return;
    }

    console.log(`✅ Found Instance: ${instance.name} (${instance.phoneNumber})`);
    const token = instance.uazapiToken;
    if (!token) {
        console.log('❌ No Token!');
        return;
    }
    console.log(`🔑 Token: ${token.substring(0, 10)}...`);

    const baseUrl = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';
    console.log(`🌐 Base URL: ${baseUrl}`);

    const endpoints = [
        { method: 'POST', url: '/chat/findChats', body: { count: 10, limit: 10, page: 1 } },
        { method: 'GET', url: '/chat/findChats' },
        { method: 'POST', url: '/chat/find', body: { count: 10, limit: 10, page: 1 } },
        { method: 'POST', url: `/chat/findChats/${encodeURIComponent(instance.name.trim())}`, body: { count: 10, page: 1 } },
        { method: 'POST', url: `/chat/findMessages/${instance.phoneNumber}`, body: { count: 10, page: 1 } }, // Try finding messages for self? Unlikely but...
        // Evolution v2
        { method: 'GET', url: `/chat/findChats/${encodeURIComponent(instance.name.trim())}` },
    ];

    for (const ep of endpoints) {
        console.log(`\n📡 Testing ${ep.method} ${ep.url}...`);
        try {
            const res = await fetch(`${baseUrl}${ep.url}`, {
                method: ep.method,
                headers: {
                    'Content-Type': 'application/json',
                    'token': token,
                    'apikey': process.env.UAZAPI_ADMIN_TOKEN || ''
                },
                body: ep.body ? JSON.stringify(ep.body) : undefined
            });
            console.log(`   Status: ${res.status} ${res.statusText}`);
            if (res.ok) {
                const data = await res.json();
                const isArray = Array.isArray(data);
                const isObjArray = data && data.chats && Array.isArray(data.chats);
                console.log(`   ✅ SUCCESS! Data is Array? ${isArray}. Data.chats Array? ${isObjArray}`);
                if (isArray) console.log(`   Count: ${data.length}`);
                if (isObjArray) console.log(`   Count: ${data.chats.length}`);
                // console.log('Sample:', JSON.stringify(data).substring(0, 200));
            } else {
                // console.log(await res.text());
            }
        } catch (e: any) {
            console.log(`   ❌ Error: ${e.message}`);
        }
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
