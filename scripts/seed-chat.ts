
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Safe Seeding Test Chat...');

    const instance = await prisma.connection.findFirst({
        where: { status: 'CONNECTED' },
    });

    if (!instance) {
        console.log('❌ No connected instance found.');
        return;
    }
    console.log(`✅ Instance: ${instance.name}`);

    // Create Contact
    const phone = '5511999999999';
    console.log('Creating contact...');
    let contact = await prisma.contact.findUnique({ where: { phoneNumber: phone } });
    if (!contact) {
        contact = await prisma.contact.create({
            data: {
                phoneNumber: phone,
                name: 'Teste de Lógica',
                profilePicUrl: 'https://ui-avatars.com/api/?name=Teste+Logica&background=random',
                organizationId: instance.organizationId,
                source: instance.id
            }
        });
    }

    console.log('Creating session...');
    // Check session
    let session = await prisma.chatSession.findFirst({
        where: { connectionId: instance.id, contactId: contact.id }
    });

    if (!session) {
        session = await prisma.chatSession.create({
            data: {
                connectionId: instance.id,
                contactId: contact.id,
                organizationId: instance.organizationId,
                status: 'ACTIVE',
                lastMessageAt: new Date(),
                customerJourney: 'new'
            }
        });
    } else {
        console.log('Session already exists.');
    }

    console.log('Creating message...');
    await prisma.message.create({
        data: {
            sessionId: session.id,
            content: 'Olá! Esta conversa valida a lógica de listagem.',
            fromMe: false,
            type: 'text',
            status: 'RECEIVED',
            timestamp: new Date()
        }
    });

    console.log(`✅ Chat created: ${phone}.`);
}

main()
    .catch((e) => {
        console.error('❌ FATAL ERROR:');
        console.error(e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
