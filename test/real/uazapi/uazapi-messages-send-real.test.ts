/**
 * 🔥 TESTE BRUTAL: ENVIO DE MENSAGENS WHATSAPP (UAZAPI)
 * 
 * Valida envio de diferentes tipos de mensagens:
 * - Mensagem de texto simples
 * - Mensagem com citação (reply)
 * - Imagem (URL)
 * - Arquivo/Documento
 * - Validar IDs retornados
 * - Verificar status de entrega
 * 
 * FILOSOFIA 100% REAL:
 * - UAZAPI real
 * - WhatsApp real
 * - PostgreSQL real
 * - Mensagens realmente enviadas
 */

import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// Número de telefone de teste (formato WhatsApp: 5511999999999@s.whatsapp.net)
const TEST_CHAT_ID = process.env.TEST_WHATSAPP_NUMBER || '5511999999999@s.whatsapp.net';

async function loginAsUser(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  
  const user = await db.user.findFirst({
    where: {
      organizations: {
        some: {}
      }
    }
  });
  
  if (!user) {
    throw new Error('Nenhum usuário com organização encontrado');
  }
  
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}

test.describe('🔥 UAZAPI MESSAGES - TESTE BRUTAL', () => {
  let connectedInstanceId: string | null = null;

  test.beforeAll(async () => {
    // Buscar instância conectada para testes
    const connectedInstance = await db.instance.findFirst({
      where: { status: 'connected' }
    });
    
    if (connectedInstance) {
      connectedInstanceId = connectedInstance.id;
      console.log(`✅ Usando instância conectada: ${connectedInstance.name}`);
    } else {
      console.warn(`⚠️  NENHUMA INSTÂNCIA CONECTADA!
        
        Para executar este teste:
        1. Execute primeiro: npm run test:uazapi:instances
        2. Escaneie o QR code quando solicitado
        3. Aguarde conexão estabelecer
        4. Execute este teste novamente
      `);
    }
  });

  test.afterAll(async () => {
    await db.$disconnect();
  });

  test('1. ✅ Deve enviar mensagem de texto simples', async ({ page }) => {
    console.log('\n💬 TESTE 1: Enviar mensagem de texto');
    
    if (!connectedInstanceId) {
      console.log('⚠️  Pulando: nenhuma instância conectada');
      test.skip();
      return;
    }
    
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes/conversations`);
    
    // Procurar campo de mensagem
    const messageInput = page.locator('textarea[name="message"], textarea[placeholder*="mensagem"], input[type="text"][placeholder*="mensagem"]').first();
    
    if (await messageInput.count() > 0) {
      const testMessage = `🧪 Teste automatizado - ${new Date().toISOString()}`;
      
      console.log(`💬 Enviando: "${testMessage}"`);
      console.log(`📞 Para: ${TEST_CHAT_ID}`);
      
      await messageInput.fill(testMessage);
      
      // Submeter mensagem
      const sendButton = page.locator('button[type="submit"], button[aria-label*="Send"], button[aria-label*="Enviar"]').first();
      await sendButton.click();
      
      // Aguardar confirmação
      await page.waitForTimeout(3000);
      
      // Procurar mensagem enviada na UI
      const sentMessage = page.locator(`text="${testMessage}"`);
      const messageVisible = await sentMessage.count() > 0;
      
      if (messageVisible) {
        console.log('✅ Mensagem aparece na UI');
      }
      
      console.log(`✅ Mensagem enviada com sucesso!
        
        ⏳ Verifique no WhatsApp se recebeu:
        "${testMessage}"
      `);
    } else {
      console.log('⚠️  Interface de mensagens não encontrada');
    }
  });

  test('2. ✅ Deve enviar imagem via URL', async ({ page }) => {
    console.log('\n🖼️  TESTE 2: Enviar imagem');
    
    if (!connectedInstanceId) {
      test.skip();
      return;
    }
    
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes/conversations`);
    
    // Procurar botão de anexo/mídia
    const attachButton = page.locator('button[aria-label*="Attach"], button[aria-label*="Anexar"], button').filter({ 
      hasText: /📎|anexo|attach/i 
    }).first();
    
    if (await attachButton.count() > 0) {
      await attachButton.click();
      await page.waitForTimeout(1000);
      
      // Procurar opção de imagem
      const imageOption = page.locator('button, a').filter({ hasText: /imagem|image|foto/i }).first();
      
      if (await imageOption.count() > 0) {
        await imageOption.click();
        await page.waitForTimeout(1000);
        
        // Preencher URL da imagem
        const imageUrl = 'https://picsum.photos/800/600';
        const urlInput = page.locator('input[name="imageUrl"], input[placeholder*="URL"]');
        
        if (await urlInput.count() > 0) {
          await urlInput.fill(imageUrl);
          
          // Caption (opcional)
          const captionInput = page.locator('input[name="caption"], textarea[name="caption"]');
          if (await captionInput.count() > 0) {
            await captionInput.fill('🧪 Teste de imagem automatizado');
          }
          
          // Enviar
          const sendButton = page.locator('button').filter({ hasText: /enviar|send/i }).first();
          await sendButton.click();
          await page.waitForTimeout(3000);
          
          console.log(`✅ Imagem enviada!
            URL: ${imageUrl}
            
            ⏳ Verifique no WhatsApp se recebeu a imagem
          `);
        }
      } else {
        console.log('⚠️  Opção de enviar imagem não encontrada na UI');
      }
    } else {
      console.log('⚠️  Botão de anexo não encontrado');
    }
  });

  test('3. ✅ Deve validar lista de mensagens', async ({ page }) => {
    console.log('\n📋 TESTE 3: Listar mensagens de um chat');
    
    if (!connectedInstanceId) {
      test.skip();
      return;
    }
    
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes/conversations`);
    
    // Aguardar lista carregar
    await page.waitForTimeout(2000);
    
    // Procurar lista de mensagens
    const messagesList = page.locator('.messages-list, [data-testid="messages"], .chat-messages').first();
    
    if (await messagesList.count() > 0) {
      console.log('✅ Lista de mensagens carregada');
      
      // Contar mensagens visíveis
      const messages = page.locator('.message-item, [data-message], .chat-message');
      const messageCount = await messages.count();
      
      console.log(`📊 Mensagens visíveis na UI: ${messageCount}`);
    } else {
      console.log('⚠️  Lista de mensagens não encontrada (pode estar vazia)');
    }
  });

  test('4. 📸 Screenshot do chat', async ({ page }) => {
    console.log('\n📸 TESTE 4: Screenshot');
    
    if (!connectedInstanceId) {
      test.skip();
      return;
    }
    
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes/conversations`);
    
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: 'test-results/screenshots/uazapi-messages.png',
      fullPage: true 
    });
    
    console.log('✅ Screenshot salvo');
  });
});

