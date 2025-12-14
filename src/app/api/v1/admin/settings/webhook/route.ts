
import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/services/database';
import { uazapiService } from '@/lib/api/uazapi.service';
import { verifyAccessToken, extractTokenFromHeader } from '@/lib/auth/jwt';
import { IntegrationType } from '@prisma/client';

async function getCurrentUser(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    const token = extractTokenFromHeader(authHeader || undefined);
    if (!token) return null;
    return verifyAccessToken(token);
}

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser(request);
        if (!user || (user.role !== 'admin' && (user.role as string) !== 'master')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Find Global UAZapi Webhook (using Admin's org or a system specific logic)
        // Assuming we store it under the user's current Org as "Default" configuration
        const config = await database.integrationConfig.findFirst({
            where: {
                organizationId: user.currentOrgId!, // Or iterate to find 'isDefault'
                type: IntegrationType.UAZAPI,
                isDefault: true
            }
        });

        if (!config) {
            return NextResponse.json(null);
        }

        // Parse settings JSON
        const settings = config.settings as any || {};

        return NextResponse.json({
            url: config.webhookUrl || '',
            events: settings.events || ['connection', 'messages'],
            excludeMessages: settings.excludeMessages || ['wasSentByApi'],
            addUrlEvents: settings.addUrlEvents || false,
            addUrlTypesMessages: settings.addUrlTypesMessages || false
        });
    } catch (error: any) {
        console.error('[WebhookSettings] GET Error:', error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser(request);
        if (!user || (user.role !== 'admin' && (user.role as string) !== 'master')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { url, events, excludeMessages, addUrlEvents, addUrlTypesMessages } = body;

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Brutal Check: Localhost
        if (url.includes('localhost') || url.includes('127.0.0.1')) {
            // Return warning? Or Error? 
            // We accept it but warn in logs. 
            console.warn('[WebhookSettings] Warning: Localhost URL used. UAZapi will fail to reach this.');
        }

        // Upsert Configuration
        const config = await database.integrationConfig.upsert({
            where: {
                organizationId_type_name: {
                    organizationId: user.currentOrgId!,
                    type: IntegrationType.UAZAPI,
                    name: 'Global Webhook'
                }
            },
            update: {
                webhookUrl: url,
                settings: { events, excludeMessages, addUrlEvents, addUrlTypesMessages },
                isActive: true,
                isDefault: true
            },
            create: {
                organizationId: user.currentOrgId!,
                type: IntegrationType.UAZAPI,
                name: 'Global Webhook',
                webhookUrl: url,
                settings: { events, excludeMessages, addUrlEvents, addUrlTypesMessages },
                isActive: true,
                isDefault: true
            }
        });

        // BRUTAL SYNC: Update all CONNECTED instances
        console.log('[WebhookSettings] Brutal Sync: Updating all connected instances...');
        const instances = await database.connection.findMany({
            where: {
                organizationId: user.currentOrgId!,
                status: 'CONNECTED' // Only connected can accept webhook update
            }
        });

        let syncedCount = 0;
        let errors = 0;

        for (const instance of instances) {
            // Assume instance.name is the token/instanceId
            try {
                console.log(`[WebhookSettings] Syncing instance: ${instance.name}`);
                const result = await uazapiService.setWebhook(instance.name, url, events);
                if (result.success) {
                    syncedCount++;
                } else {
                    console.error(`[WebhookSettings] Failed to sync ${instance.name}:`, result.error);
                    errors++;
                }
            } catch (e) {
                console.error(`[WebhookSettings] Exception syncing ${instance.name}:`, e);
                errors++;
            }
        }

        return NextResponse.json({
            success: true,
            data: config,
            sync: {
                total: instances.length,
                synced: syncedCount,
                errors: errors
            }
        });

    } catch (error: any) {
        console.error('[WebhookSettings] POST Error:', error);
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }
}
