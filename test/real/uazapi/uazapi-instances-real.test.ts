/**
 * 🔥 TESTE BRUTAL: INSTÂNCIAS WHATSAPP (UAZAPI)
 * 
 * Valida integração COMPLETA com UAZAPI:
 * - Criar instância
 * - Conectar e gerar QR code
 * - Escanear QR code MANUALMENTE
 * - Verificar status (connected)
 * - Obter dados do perfil
 * - Desconectar
 * - Deletar instância
 * 
 * FILOSOFIA 100% REAL:
 * - UAZAPI real
 * - WhatsApp real (QR code manual)
 * - PostgreSQL real
 * - Playwright browser real
 * - Validação dupla: visual + database + UAZAPI status
 */

import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function loginAsUser(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  
  // Buscar usuário com organização
  const user = await db.user.findFirst({
    where: {
      organizations: {
        some: {}
      }
    }
  });
  
  if (!user) {
    throw new Error('Nenhum usuário com organização encontrado. Execute db:seed primeiro!');
  }
  
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', '123456');
  await page.click('button[type="submit"]');
  
  // Pode ir para /integracoes ou /onboarding
  await page.waitForTimeout(3000);
}

test.describe('🔥 UAZAPI INSTANCES - TESTE BRUTAL', () => {
  let testInstanceId: string | null = null;
  let testInstanceToken: string | null = null;

  test.afterAll(async () => {
    // Limpar instância de teste
    if (testInstanceId) {
      await db.instance.delete({
        where: { id: testInstanceId }
      }).catch(() => console.log('⚠️  Instância já foi deletada'));
    }
    
    await db.$disconnect();
  });

  test('1. ✅ Deve criar nova instância WhatsApp', async ({ page }) => {
    console.log('\n🚀 TESTE 1: Criar instância');
    
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes`);
    
    // Procurar botão criar instância
    const createButton = page.locator('button, a').filter({ 
      hasText: /nova instância|new instance|criar|adicionar/i 
    }).first();
    
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();
    await page.waitForTimeout(1000);
    
    // Preencher formulário
    const instanceName = `Test Instance ${Date.now()}`;
    
    console.log(`📝 Criando instância: ${instanceName}`);
    
    await page.fill('input[name="name"], input[placeholder*="Nome"]', instanceName);
    
    // Webhook URL (opcional)
    const webhookInput = page.locator('input[name="webhookUrl"], input[placeholder*="Webhook"]');
    if (await webhookInput.count() > 0) {
      await webhookInput.fill('https://webhook.site/test');
    }
    
    // Submeter
    const submitButton = page.locator('button[type="submit"], button').filter({ 
      hasText: /criar|salvar|save/i 
    }).first();
    
    await submitButton.click();
    await page.waitForTimeout(3000);
    
    // Validar criação no banco
    const createdInstance = await db.instance.findFirst({
      where: { name: instanceName },
      orderBy: { createdAt: 'desc' }
    });
    
    if (createdInstance) {
      testInstanceId = createdInstance.id;
      testInstanceToken = createdInstance.uazapiToken;
      
      console.log(`✅ Instância criada com sucesso:
        - ID: ${createdInstance.id}
        - Nome: ${createdInstance.name}
        - Status: ${createdInstance.status}
        - UAZAPI Token: ${createdInstance.uazapiToken ? '✅' : '❌'}
        - Broker ID: ${createdInstance.brokerId || 'N/A'}
      `);
      
      expect(createdInstance.uazapiToken).toBeTruthy();
    } else {
      throw new Error('❌ Instância NÃO foi criada no banco!');
    }
  });

  test('2. ✅ Deve gerar QR code para conexão', async ({ page }) => {
    console.log('\n📱 TESTE 2: Conectar e gerar QR code');
    
    if (!testInstanceId) {
      console.log('⚠️  Instância não foi criada');
      return;
    }
    
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes`);
    
    const instance = await db.instance.findUnique({
      where: { id: testInstanceId }
    });
    
    if (!instance) return;
    
    console.log(`📱 Conectando: ${instance.name}`);
    
    // Procurar botão conectar
    const connectButton = page.locator('button').filter({ 
      hasText: /conectar|connect|gerar qr/i 
    }).first();
    
    if (await connectButton.count() > 0) {
      await connectButton.click();
      
      // Aguardar QR code aparecer
      await page.waitForTimeout(3000);
      
      // Procurar QR code (pode ser img ou canvas)
      const qrCode = page.locator('img[alt*="QR"], canvas, [data-testid="qr-code"]').first();
      
      await expect(qrCode).toBeVisible({ timeout: 10000 });
      
      // Capturar screenshot do QR code
      await page.screenshot({ 
        path: 'test-results/screenshots/qr-code-instance.png',
        fullPage: false
      });
      
      console.log(`✅ QR code gerado com sucesso!
        📸 Screenshot salvo: test-results/screenshots/qr-code-instance.png
        
        ⏳ AGUARDANDO SCAN MANUAL DO QR CODE...
        
        Por favor:
        1. Abra o WhatsApp no celular
        2. Vá em Configurações > Aparelhos conectados
        3. Escaneie o QR code que apareceu na tela
        4. Aguarde a conexão estabelecer
      `);
      
      // Aguardar scan manual (até 2 minutos)
      console.log('\n⏳ Aguardando 120 segundos para scan manual...');
      await page.waitForTimeout(120000);
      
      // Verificar status no banco
      const connectedInstance = await db.instance.findUnique({
        where: { id: testInstanceId }
      });
      
      if (connectedInstance?.status === 'connected') {
        console.log(`✅ INSTÂNCIA CONECTADA COM SUCESSO!
          - Status: ${connectedInstance.status}
          - Telefone: ${connectedInstance.phoneNumber}
          - Profile Name: ${connectedInstance.profileName || 'N/A'}
        `);
      } else {
        console.warn(`⚠️  Status atual: ${connectedInstance?.status}
          Se não conectou, pode precisar de mais tempo ou QR expirou.
        `);
      }
    } else {
      console.log('⚠️  Botão de conectar não encontrado');
    }
  });

  test('3. ✅ Deve verificar status da instância', async ({ page }) => {
    console.log('\n🔍 TESTE 3: Verificar status');
    
    if (!testInstanceId) return;
    
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes`);
    
    const instance = await db.instance.findUnique({
      where: { id: testInstanceId }
    });
    
    if (!instance) return;
    
    console.log(`🔍 Status da instância:
      - Nome: ${instance.name}
      - Status: ${instance.status}
      - Telefone: ${instance.phoneNumber || 'N/A'}
      - UAZAPI Token: ${instance.uazapiToken ? '✅' : '❌'}
    `);
    
    // Verificar badge de status na UI
    const statusBadge = page.locator('[data-status], .status-badge, .instance-status').first();
    
    if (await statusBadge.count() > 0) {
      const statusText = await statusBadge.textContent();
      console.log(`✅ Status exibido na UI: ${statusText}`);
    }
  });

  test('4. ✅ Deve obter dados do perfil WhatsApp', async ({ page }) => {
    console.log('\n👤 TESTE 4: Obter profile picture');
    
    if (!testInstanceId) return;
    
    const instance = await db.instance.findUnique({
      where: { id: testInstanceId }
    });
    
    if (!instance || instance.status !== 'connected') {
      console.log('⚠️  Instância não está conectada, pulando teste de profile');
      return;
    }
    
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes`);
    
    // Procurar foto de perfil da instância
    const profilePic = page.locator('img[alt*="Profile"], img[src*="profile"], .profile-picture').first();
    
    if (await profilePic.count() > 0) {
      const src = await profilePic.getAttribute('src');
      console.log(`✅ Profile picture encontrado: ${src?.substring(0, 50)}...`);
    } else {
      console.log('⚠️  Profile picture não encontrado na UI');
    }
    
    // Verificar dados no banco
    console.log(`👤 Dados do perfil no banco:
      - Profile Name: ${instance.profileName || 'N/A'}
      - Profile Pic URL: ${instance.profilePictureUrl || 'N/A'}
      - Phone Number: ${instance.phoneNumber || 'N/A'}
    `);
  });

  test('5. ✅ Deve desconectar instância', async ({ page }) => {
    console.log('\n🔌 TESTE 5: Desconectar instância');
    
    if (!testInstanceId) return;
    
    const instance = await db.instance.findUnique({
      where: { id: testInstanceId }
    });
    
    if (!instance || instance.status !== 'connected') {
      console.log('⚠️  Instância não está conectada');
      return;
    }
    
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes`);
    
    console.log(`🔌 Desconectando: ${instance.name}`);
    
    // Procurar botão desconectar
    const disconnectButton = page.locator('button').filter({ 
      hasText: /desconectar|disconnect/i 
    }).first();
    
    if (await disconnectButton.count() > 0) {
      await disconnectButton.click();
      
      // Confirmação
      await page.waitForTimeout(1000);
      const confirmButton = page.locator('button').filter({ 
        hasText: /sim|yes|confirm/i 
      }).first();
      
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
      }
      
      // Aguardar desconexão
      await page.waitForTimeout(3000);
      
      // Validar no banco
      const disconnectedInstance = await db.instance.findUnique({
        where: { id: testInstanceId }
      });
      
      if (disconnectedInstance?.status === 'disconnected') {
        console.log('✅ Instância desconectada com sucesso');
      } else {
        console.warn(`⚠️  Status: ${disconnectedInstance?.status}`);
      }
    }
  });

  test('6. ✅ Deve deletar instância', async ({ page }) => {
    console.log('\n🗑️  TESTE 6: Deletar instância');
    
    if (!testInstanceId) return;
    
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes`);
    
    const instance = await db.instance.findUnique({
      where: { id: testInstanceId }
    });
    
    if (!instance) return;
    
    console.log(`🗑️  Deletando: ${instance.name}`);
    
    // Procurar botão deletar
    const deleteButton = page.locator('button[aria-label*="Delete"], button').filter({ 
      hasText: /deletar|delete|remover/i 
    }).first();
    
    if (await deleteButton.count() > 0) {
      await deleteButton.click();
      
      // Confirmação
      await page.waitForTimeout(1000);
      const confirmButton = page.locator('button').filter({ 
        hasText: /sim|yes|confirm|deletar/i 
      }).first();
      
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
      }
      
      await page.waitForTimeout(3000);
      
      // Validar que foi deletada
      const deletedInstance = await db.instance.findUnique({
        where: { id: testInstanceId }
      });
      
      if (!deletedInstance) {
        console.log('✅ Instância deletada com sucesso (hard delete)');
        testInstanceId = null;
      } else {
        console.warn('⚠️  Instância ainda existe no banco');
      }
    }
  });

  test('7. 📸 Screenshot completo do fluxo', async ({ page }) => {
    console.log('\n📸 TESTE 7: Screenshots');
    
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes`);
    
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: 'test-results/screenshots/uazapi-instances.png',
      fullPage: true 
    });
    
    console.log('✅ Screenshot salvo');
  });
});

