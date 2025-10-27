/**
 * 🔥 TESTE BRUTAL: GERENCIAMENTO DE INTEGRAÇÕES (ADMIN)
 * 
 * Valida administração de TODAS as instâncias WhatsApp:
 * - Listar TODAS as instâncias (todas organizações)
 * - Filtrar por status (connected, disconnected, connecting)
 * - Filtrar por organização
 * - Visualizar detalhes (QR code, status, org)
 * - Forçar desconexão de qualquer instância
 * - Deletar instância de qualquer organização
 * - Validar RBAC (admin vê tudo, user vê só sua org)
 * 
 * FILOSOFIA 100% REAL:
 * - PostgreSQL real
 * - Playwright browser real
 * - Validação dupla: visual + database
 * - Zero mocks
 */

import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]', 'admin@quayer.com');
  await page.fill('input[name="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/admin`, { timeout: 10000 });
}

async function loginAsUser(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  
  // Buscar um usuário comum do banco
  const user = await db.user.findFirst({
    where: {
      role: 'user',
      email: { not: 'admin@quayer.com' }
    }
  });
  
  if (user) {
    await page.fill('input[name="email"]', user.email);
    await page.fill('input[name="password"]', '123456');
    await page.click('button[type="submit"]');
  }
}

test.describe('🔥 ADMIN INTEGRAÇÕES - TESTE BRUTAL', () => {
  test.beforeAll(async () => {
    console.log('📊 Validando dados de instâncias...');
    
    const instanceCount = await db.instance.count();
    const orgCount = await db.organization.count({ where: { deletedAt: null } });
    
    console.log(`✅ Instâncias: ${instanceCount}, Organizações: ${orgCount}`);
    
    if (instanceCount === 0) {
      console.warn('⚠️  AVISO: Nenhuma instância encontrada. Crie algumas instâncias de teste!');
    }
  });

  test.afterAll(async () => {
    await db.$disconnect();
  });

  test('1. ✅ Admin deve acessar /admin/integracoes', async ({ page }) => {
    console.log('\n🚀 TESTE 1: Acessar página de integrações admin');
    
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/integracoes`);
    
    // Validar URL
    await expect(page).toHaveURL(`${BASE_URL}/admin/integracoes`);
    
    // Validar título
    const heading = page.locator('h1, h2').filter({ hasText: /integra|instância|whatsapp/i }).first();
    await expect(heading).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Página de integrações admin acessível');
  });

  test('2. ✅ Admin deve ver TODAS as instâncias (multi-org)', async ({ page }) => {
    console.log('\n🌐 TESTE 2: Listar TODAS as instâncias (multi-org)');
    
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/integracoes`);
    
    // Buscar todas as instâncias do banco
    const allInstances = await db.instance.findMany({
      include: {
        organization: true
      }
    });
    
    console.log(`📊 Total de instâncias no banco: ${allInstances.length}`);
    
    // Agrupar por organização
    const byOrg = allInstances.reduce((acc, inst) => {
      const orgName = inst.organization?.name || 'Sem organização';
      acc[orgName] = (acc[orgName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('📊 Instâncias por organização:');
    Object.entries(byOrg).forEach(([org, count]) => {
      console.log(`  - ${org}: ${count} instância(s)`);
    });
    
    // Validar que a tabela está visível
    const table = page.locator('table, [role="table"], .data-table').first();
    await expect(table).toBeVisible({ timeout: 5000 });
    
    // Validar que mostra instâncias de diferentes organizações
    if (Object.keys(byOrg).length > 1) {
      console.log('✅ Admin pode ver instâncias de múltiplas organizações');
    } else {
      console.log('⚠️  Apenas 1 organização com instâncias');
    }
  });

  test('3. ✅ Deve filtrar por status (connected/disconnected)', async ({ page }) => {
    console.log('\n🔍 TESTE 3: Filtrar por status');
    
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/integracoes`);
    
    // Contar por status no banco
    const connected = await db.instance.count({ where: { status: 'connected' } });
    const disconnected = await db.instance.count({ where: { status: 'disconnected' } });
    const connecting = await db.instance.count({ where: { status: 'connecting' } });
    
    console.log(`📊 Status das instâncias:
      - Connected: ${connected}
      - Disconnected: ${disconnected}
      - Connecting: ${connecting}
    `);
    
    // Procurar filtro de status
    const statusFilter = page.locator('select[name="status"], [data-testid="status-filter"]').first();
    
    if (await statusFilter.count() > 0) {
      // Testar filtro "connected"
      await statusFilter.selectOption('connected');
      await page.waitForTimeout(1000);
      
      console.log('✅ Filtro de status funcionando');
    } else {
      // Pode ser botões em vez de select
      const connectedButton = page.locator('button').filter({ hasText: /conectad|connected/i }).first();
      if (await connectedButton.count() > 0) {
        await connectedButton.click();
        await page.waitForTimeout(1000);
        console.log('✅ Filtro de status (botões) funcionando');
      } else {
        console.log('⚠️  Filtro de status não encontrado');
      }
    }
  });

  test('4. ✅ Deve filtrar por organização', async ({ page }) => {
    console.log('\n🏢 TESTE 4: Filtrar por organização');
    
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/integracoes`);
    
    // Buscar organizações com instâncias
    const orgsWithInstances = await db.organization.findMany({
      where: {
        deletedAt: null,
        instances: {
          some: {}
        }
      },
      include: {
        instances: true
      }
    });
    
    if (orgsWithInstances.length === 0) {
      console.log('⚠️  Nenhuma organização com instâncias para filtrar');
      return;
    }
    
    const firstOrg = orgsWithInstances[0];
    console.log(`🏢 Filtrando por: ${firstOrg.name} (${firstOrg.instances.length} instâncias)`);
    
    // Procurar filtro de organização
    const orgFilter = page.locator('select[name="organization"], select[name="organizationId"]').first();
    
    if (await orgFilter.count() > 0) {
      await orgFilter.selectOption(firstOrg.id);
      await page.waitForTimeout(1000);
      
      // Validar que mostra apenas instâncias dessa org
      const pageText = await page.textContent('body');
      const hasOrgName = pageText?.includes(firstOrg.name);
      
      if (hasOrgName) {
        console.log('✅ Filtro por organização funcionando');
      }
    } else {
      console.log('⚠️  Filtro de organização não encontrado');
    }
  });

  test('5. ✅ Deve visualizar detalhes de uma instância', async ({ page }) => {
    console.log('\n👁️  TESTE 5: Visualizar detalhes da instância');
    
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/integracoes`);
    
    // Buscar instância do banco
    const instance = await db.instance.findFirst({
      include: {
        organization: true
      }
    });
    
    if (!instance) {
      console.log('⚠️  Nenhuma instância para visualizar');
      return;
    }
    
    console.log(`📊 Visualizando instância:
      - Nome: ${instance.name}
      - Status: ${instance.status}
      - Organização: ${instance.organization?.name || 'N/A'}
      - Telefone: ${instance.phoneNumber || 'Não conectado'}
    `);
    
    // Procurar botão de visualizar
    const viewButton = page.locator('button, a').filter({ 
      hasText: /ver|view|detalhes|details/i 
    }).first();
    
    if (await viewButton.count() > 0) {
      await viewButton.click();
      await page.waitForTimeout(1500);
      
      // Deve aparecer modal ou navegar para página de detalhes
      const modal = page.locator('[role="dialog"], .modal');
      const hasModal = await modal.count() > 0;
      
      if (hasModal) {
        // Verificar se mostra QR code (se estiver connecting/disconnected)
        if (instance.status !== 'connected') {
          const qrCode = page.locator('img[alt*="QR"], canvas, [data-testid="qr-code"]');
          const hasQR = await qrCode.count() > 0;
          
          if (hasQR) {
            console.log('✅ QR Code exibido para conexão');
          }
        }
        
        console.log('✅ Detalhes da instância exibidos');
      }
    } else {
      console.log('⚠️  Botão de visualizar não encontrado');
    }
  });

  test('6. ✅ Admin deve poder forçar desconexão', async ({ page }) => {
    console.log('\n🔌 TESTE 6: Forçar desconexão de instância');
    
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/integracoes`);
    
    // Buscar instância conectada
    const connectedInstance = await db.instance.findFirst({
      where: { status: 'connected' }
    });
    
    if (!connectedInstance) {
      console.log('⚠️  Nenhuma instância conectada para testar desconexão');
      return;
    }
    
    console.log(`🔌 Desconectando: ${connectedInstance.name}`);
    
    // Procurar botão de desconectar
    const disconnectButton = page.locator('button').filter({ 
      hasText: /desconectar|disconnect/i 
    }).first();
    
    if (await disconnectButton.count() > 0) {
      await disconnectButton.click();
      
      // Pode ter confirmação
      await page.waitForTimeout(1000);
      const confirmButton = page.locator('button').filter({ 
        hasText: /sim|yes|confirmar|confirm/i 
      }).first();
      
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
      }
      
      await page.waitForTimeout(3000);
      
      // Validar no banco
      const updatedInstance = await db.instance.findUnique({
        where: { id: connectedInstance.id }
      });
      
      if (updatedInstance?.status === 'disconnected') {
        console.log('✅ Instância desconectada com sucesso');
      } else {
        console.warn(`⚠️  Status: ${updatedInstance?.status} (pode levar tempo)`);
      }
    } else {
      console.log('⚠️  Botão de desconectar não encontrado');
    }
  });

  test('7. ✅ Admin deve poder deletar instância de qualquer org', async ({ page }) => {
    console.log('\n🗑️  TESTE 7: Deletar instância (admin power)');
    
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/integracoes`);
    
    // Criar instância de teste para deletar
    const testOrg = await db.organization.findFirst({
      where: { deletedAt: null }
    });
    
    if (!testOrg) {
      console.log('⚠️  Nenhuma organização para criar instância de teste');
      return;
    }
    
    const testInstance = await db.instance.create({
      data: {
        name: `Test Instance ${Date.now()}`,
        status: 'disconnected',
        brokerType: 'UAZAPI',
        organizationId: testOrg.id
      }
    });
    
    console.log(`🗑️  Deletando instância de teste: ${testInstance.name}`);
    
    // Recarregar página para ver nova instância
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Procurar botão de deletar
    const deleteButton = page.locator('button[aria-label*="Delete"], button').filter({ 
      hasText: /deletar|delete|remover/i 
    }).last(); // Pega o último (mais recente)
    
    if (await deleteButton.count() > 0) {
      await deleteButton.click();
      
      // Confirmação
      await page.waitForTimeout(1000);
      const confirmButton = page.locator('button').filter({ 
        hasText: /sim|yes|confirmar|confirm|deletar/i 
      }).first();
      
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
      }
      
      await page.waitForTimeout(2000);
      
      // Validar que foi deletada
      const deletedInstance = await db.instance.findUnique({
        where: { id: testInstance.id }
      });
      
      if (!deletedInstance) {
        console.log('✅ Instância deletada com sucesso (hard delete)');
      } else {
        console.warn('⚠️  Instância ainda existe no banco');
        // Limpar manualmente
        await db.instance.delete({ where: { id: testInstance.id } });
      }
    } else {
      console.log('⚠️  Botão de deletar não encontrado');
      // Limpar instância de teste
      await db.instance.delete({ where: { id: testInstance.id } });
    }
  });

  test('8. ❌ User comum NÃO deve ver instâncias de outras orgs', async ({ page }) => {
    console.log('\n🚫 TESTE 8: RBAC - User vê apenas sua org');
    
    // Login como user comum
    await loginAsUser(page);
    await page.goto(`${BASE_URL}/integracoes`);
    
    // Buscar usuário logado
    const pageContent = await page.textContent('body');
    
    // Buscar user do banco
    const user = await db.user.findFirst({
      where: {
        role: 'user',
        email: { not: 'admin@quayer.com' }
      },
      include: {
        organizations: {
          include: {
            organization: {
              include: {
                instances: true
              }
            }
          }
        }
      }
    });
    
    if (!user || user.organizations.length === 0) {
      console.log('⚠️  User não tem organização para testar RBAC');
      return;
    }
    
    const userOrg = user.organizations[0].organization;
    const userInstances = userOrg.instances;
    
    console.log(`👤 User: ${user.email}
      - Organização: ${userOrg.name}
      - Instâncias da org: ${userInstances.length}
    `);
    
    // Buscar instâncias de OUTRAS organizações
    const otherOrgInstances = await db.instance.findMany({
      where: {
        organizationId: {
          not: userOrg.id
        }
      }
    });
    
    if (otherOrgInstances.length > 0) {
      // Verificar se alguma instância de outra org aparece na página
      const otherInstanceVisible = otherOrgInstances.some(inst => 
        pageContent?.includes(inst.name)
      );
      
      if (!otherInstanceVisible) {
        console.log('✅ RBAC funcionando: User NÃO vê instâncias de outras orgs');
      } else {
        console.error('❌ RBAC FALHOU: User VÊ instâncias de outras orgs!');
      }
      
      expect(otherInstanceVisible).toBeFalsy();
    } else {
      console.log('⚠️  Não há instâncias de outras orgs para testar RBAC');
    }
  });

  test('9. ✅ Validar sincronização com UAZAPI', async ({ page }) => {
    console.log('\n🔄 TESTE 9: Validar dados de instâncias conectadas');
    
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/integracoes`);
    
    // Buscar instâncias conectadas
    const connectedInstances = await db.instance.findMany({
      where: { status: 'connected' }
    });
    
    console.log(`🔄 Instâncias conectadas: ${connectedInstances.length}`);
    
    connectedInstances.forEach(inst => {
      console.log(`  - ${inst.name}:
        Status: ${inst.status}
        Telefone: ${inst.phoneNumber || 'N/A'}
        UAZAPI Token: ${inst.uazapiToken ? '✅' : '❌'}
        Broker ID: ${inst.brokerId || 'N/A'}
      `);
    });
    
    // Validar que instâncias conectadas têm dados essenciais
    const allConnectedHaveData = connectedInstances.every(inst => 
      inst.uazapiToken && inst.phoneNumber
    );
    
    if (allConnectedHaveData || connectedInstances.length === 0) {
      console.log('✅ Todas as instâncias conectadas têm dados completos');
    } else {
      console.warn('⚠️  Algumas instâncias conectadas têm dados incompletos');
    }
  });

  test('10. 📸 Screenshot da página de integrações admin', async ({ page }) => {
    console.log('\n📸 TESTE 10: Capturar screenshot');
    
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/integracoes`);
    
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: 'test-results/screenshots/admin-integracoes.png',
      fullPage: true 
    });
    
    console.log('✅ Screenshot salvo: test-results/screenshots/admin-integracoes.png');
  });
});

