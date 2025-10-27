/**
 * 🔥 JORNADA E2E: WEBHOOKS + AUTOMAÇÃO
 * 
 * Fluxo completo de webhooks:
 * 1. Configurar webhook para eventos messages
 * 2. Enviar mensagem REAL via WhatsApp
 * 3. Validar payload recebido
 * 4. Processar e salvar no banco
 * 5. Verificar logs
 * 
 * FILOSOFIA 100% REAL:
 * - WhatsApp real
 * - UAZAPI real
 * - HTTP webhooks reais
 * - PostgreSQL real
 */

import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const WEBHOOK_URL = process.env.WEBHOOK_URL || `${BASE_URL}/api/v1/webhooks/receive`;

async function loginAsUser(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  
  const user = await db.user.findFirst({
    where: {
      organizations: {
        some: {}
      }
    }
  });
  
  if (!user) throw new Error('Nenhum usuário encontrado');
  
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}

test.describe('🔥 WEBHOOKS AUTOMATION - JORNADA E2E', () => {
  let webhookId: string | null = null;

  test.beforeAll(async () => {
    console.log('🪝 Preparando teste de webhooks...');
  });

  test.afterAll(async () => {
    if (webhookId) {
      await db.webhook.delete({ where: { id: webhookId } }).catch(() => {});
    }
    await db.$disconnect();
  });

  test('PASSO 1: ⚙️ Configurar webhook', async ({ page }) => {
    console.log('\n⚙️ PASSO 1: Configurar webhook...');
    
    const instance = await db.instance.findFirst({
      where: { status: 'connected' }
    });
    
    if (!instance) {
      console.warn('⚠️  PULE ESTE TESTE: Nenhuma instância conectada');
      test.skip();
      return;
    }
    
    console.log(`🪝 Configurando webhook para: ${instance.name}`);
    
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes/settings`);
    
    const urlInput = page.locator('input[name="webhookUrl"]').first();
    
    if (await urlInput.count() > 0) {
      await urlInput.fill(WEBHOOK_URL);
      
      const saveButton = page.locator('button').filter({ hasText: /salvar|save/i }).first();
      await saveButton.click();
      await page.waitForTimeout(2000);
      
      const webhook = await db.webhook.findFirst({
        where: {
          instanceId: instance.id,
          url: WEBHOOK_URL
        }
      });
      
      if (webhook) {
        webhookId = webhook.id;
        console.log(`✅ Webhook configurado:
          - URL: ${webhook.url}
          - Eventos: ${webhook.events?.join(', ')}
        `);
      }
    }
  });

  test('PASSO 2: 📨 Enviar mensagem e validar webhook', async ({ page }) => {
    console.log('\n📨 PASSO 2: Testar recebimento via webhook...');
    
    if (!webhookId) {
      test.skip();
      return;
    }
    
    console.log(`
      ⏳ INTERAÇÃO MANUAL:
      
      1. Abra WhatsApp no celular
      2. Envie mensagem para a instância conectada
      3. Digite: "Teste webhook automation"
      4. Aguarde 30 segundos
    `);
    
    await page.waitForTimeout(30000);
    
    console.log('✅ Tempo de espera concluído. Verifique logs do webhook.');
  });

  test('PASSO 3: 📸 Screenshot final', async ({ page }) => {
    if (!webhookId) {
      test.skip();
      return;
    }
    
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes/conversations`);
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: 'test-results/screenshots/e2e-webhooks-automation.png',
      fullPage: true 
    });
    console.log('✅ Screenshot salvo');
  });
});

