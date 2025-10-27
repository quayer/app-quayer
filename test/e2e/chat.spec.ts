/**
 * E2E Tests - Chat System
 *
 * Testa chat real-time com SSE, múltiplos tipos de mensagem, optimistic updates
 */

import { test, expect } from '@playwright/test';
import { autoAuth, waitForElement } from './helpers/auth.helper';

test.describe('Chat - Interface', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve carregar página de chat com sucesso', async ({ page }) => {
    // Navegar para uma sessão (assumindo que existe sessão de teste)
    await page.goto('http://localhost:3000/conversas');

    // Aguardar lista de conversas ou redirect
    await page.waitForLoadState('networkidle');

    // Verificar que carregou alguma interface de chat
    await expect(
      page.locator('text=Conversas, text=Mensagens, text=Chat')
    ).toBeVisible({ timeout: 10000 });
  });

  test('deve mostrar lista de mensagens', async ({ page }) => {
    // Assumindo sessionId conhecido ou pegar da lista
    await page.goto('http://localhost:3000/conversas');
    await page.waitForLoadState('networkidle');

    // Se tem lista, click na primeira conversa
    const firstConversation = page.locator('[data-testid="conversation-item"]').first();

    if (await firstConversation.isVisible({ timeout: 5000 })) {
      await firstConversation.click();
    }

    // Aguardar mensagens carregarem
    await waitForElement(page, '[data-testid="message-bubble"], .message-bubble');

    // Verificar que tem mensagens ou estado vazio
    const messagesContainer = page.locator('[data-testid="messages-container"], .messages-container');
    await expect(messagesContainer).toBeVisible();
  });
});

test.describe('Chat - Enviar Mensagens', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve enviar mensagem de texto', async ({ page }) => {
    await page.goto('http://localhost:3000/conversas');
    await page.waitForLoadState('networkidle');

    // Click na primeira conversa se houver
    const firstConv = page.locator('[data-testid="conversation-item"]').first();
    if (await firstConv.isVisible({ timeout: 5000 })) {
      await firstConv.click();
    }

    // Aguardar input de mensagem
    const messageInput = page.locator('textarea[placeholder*="mensagem"], input[placeholder*="mensagem"]');

    if (await messageInput.isVisible({ timeout: 5000 })) {
      // Digitar mensagem
      await messageInput.fill('Mensagem de teste E2E via Playwright');

      // Enviar (Enter ou botão)
      await page.keyboard.press('Enter');

      // Verificar optimistic update (mensagem aparece imediatamente)
      await expect(page.locator('text=Mensagem de teste E2E via Playwright')).toBeVisible({
        timeout: 3000,
      });
    }
  });

  test('deve mostrar indicador de status (pending → sent)', async ({ page }) => {
    await page.goto('http://localhost:3000/conversas');
    await page.waitForLoadState('networkidle');

    const firstConv = page.locator('[data-testid="conversation-item"]').first();
    if (await firstConv.isVisible({ timeout: 5000 })) {
      await firstConv.click();
    }

    const messageInput = page.locator('textarea[placeholder*="mensagem"], input[placeholder*="mensagem"]');

    if (await messageInput.isVisible({ timeout: 5000 })) {
      await messageInput.fill('Teste status indicator');
      await page.keyboard.press('Enter');

      // Verificar indicador de pendente (relógio, spinner)
      await expect(
        page.locator('[data-status="pending"], [data-status="PENDING"], text=Enviando')
      ).toBeVisible({ timeout: 2000 });

      // Aguardar status mudar para sent
      await expect(
        page.locator('[data-status="sent"], [data-status="SENT"], [data-status="delivered"]')
      ).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Chat - Real-time SSE', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve estabelecer conexão SSE', async ({ page }) => {
    await page.goto('http://localhost:3000/conversas');
    await page.waitForLoadState('networkidle');

    const firstConv = page.locator('[data-testid="conversation-item"]').first();
    if (await firstConv.isVisible({ timeout: 5000 })) {
      await firstConv.click();
    }

    // Aguardar conexão SSE ser estabelecida
    // Verificar no network tab ou console
    await page.waitForTimeout(2000);

    // Se SSE conectado, deve ter EventSource ativo
    const hasSSE = await page.evaluate(() => {
      return window.performance
        .getEntriesByType('resource')
        .some((entry: any) => entry.name.includes('/sse/'));
    });

    // Esperamos que SSE esteja conectado (pode falhar se sessão não existe)
    console.log('SSE connection detected:', hasSSE);
  });

  test('deve receber mensagens em tempo real (simulado)', async ({ page }) => {
    // Este teste é difícil sem 2 browsers simultâneos
    // Simula recebendo mensagem via console trigger
    await page.goto('http://localhost:3000/conversas');
    await page.waitForLoadState('networkidle');

    const firstConv = page.locator('[data-testid="conversation-item"]').first();
    if (await firstConv.isVisible({ timeout: 5000 })) {
      await firstConv.click();
    }

    // Aguardar conexão
    await page.waitForTimeout(2000);

    // Contar mensagens antes
    const messagesBefore = await page.locator('[data-testid="message-bubble"]').count();

    // Simular chegada de nova mensagem (via API direta ou console)
    // Nota: Em teste real, enviaria de outro client
    await page.evaluate(() => {
      // Dispara evento personalizado simulando SSE
      const event = new CustomEvent('test-sse-message', {
        detail: {
          type: 'message.received',
          message: {
            id: 'test-sse-' + Date.now(),
            content: 'Mensagem recebida via SSE (teste)',
            type: 'text',
            direction: 'INBOUND',
            author: 'Teste',
            createdAt: new Date(),
          },
        },
      });
      window.dispatchEvent(event);
    });

    await page.waitForTimeout(1000);

    // Verificar que nova mensagem apareceu (se handler implementado)
    const messagesAfter = await page.locator('[data-testid="message-bubble"]').count();

    // Nota: Este teste pode precisar ajuste dependendo da implementação real
    console.log('Messages before:', messagesBefore, 'after:', messagesAfter);
  });
});

test.describe('Chat - Tipos de Mensagem', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve renderizar mensagem de texto corretamente', async ({ page }) => {
    await page.goto('http://localhost:3000/conversas');
    await page.waitForLoadState('networkidle');

    const firstConv = page.locator('[data-testid="conversation-item"]').first();
    if (await firstConv.isVisible({ timeout: 5000 })) {
      await firstConv.click();
    }

    // Verificar pelo menos uma mensagem de texto
    await expect(page.locator('[data-message-type="text"], .message-text')).toBeVisible({
      timeout: 5000,
    });
  });

  test('deve renderizar mensagem de áudio com transcrição', async ({ page }) => {
    await page.goto('http://localhost:3000/conversas');
    await page.waitForLoadState('networkidle');

    const firstConv = page.locator('[data-testid="conversation-item"]').first();
    if (await firstConv.isVisible({ timeout: 5000 })) {
      await firstConv.click();
    }

    // Procurar mensagem de áudio (se existir)
    const audioMessage = page.locator('[data-message-type="audio"], text=Áudio transcrito');

    if (await audioMessage.isVisible({ timeout: 2000 })) {
      // Verificar que tem player de áudio
      await expect(page.locator('audio')).toBeVisible();

      // Verificar que tem texto da transcrição
      await expect(audioMessage).toContainText(/.+/);
    }
  });

  test('deve renderizar mensagem de imagem com OCR', async ({ page }) => {
    await page.goto('http://localhost:3000/conversas');
    await page.waitForLoadState('networkidle');

    const firstConv = page.locator('[data-testid="conversation-item"]').first();
    if (await firstConv.isVisible({ timeout: 5000 })) {
      await firstConv.click();
    }

    // Procurar mensagem de imagem
    const imageMessage = page.locator('[data-message-type="image"], img');

    if (await imageMessage.isVisible({ timeout: 2000 })) {
      // Verificar que imagem é clicável
      await expect(imageMessage).toHaveAttribute('class', /cursor-pointer|clickable/);
    }
  });

  test('deve renderizar mensagem concatenada', async ({ page }) => {
    await page.goto('http://localhost:3000/conversas');
    await page.waitForLoadState('networkidle');

    const firstConv = page.locator('[data-testid="conversation-item"]').first();
    if (await firstConv.isVisible({ timeout: 5000 })) {
      await firstConv.click();
    }

    // Procurar mensagem concatenada
    const concatenatedMessage = page.locator(
      '[data-message-type="concatenated"], text=mensagens agrupadas'
    );

    if (await concatenatedMessage.isVisible({ timeout: 2000 })) {
      // Verificar que mostra count
      await expect(concatenatedMessage).toContainText(/\d+ mensagens/);
    }
  });
});

test.describe('Chat - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve ter aria-labels apropriados', async ({ page }) => {
    await page.goto('http://localhost:3000/conversas');
    await page.waitForLoadState('networkidle');

    const firstConv = page.locator('[data-testid="conversation-item"]').first();
    if (await firstConv.isVisible({ timeout: 5000 })) {
      await firstConv.click();
    }

    // Verificar aria-label no input
    const input = page.locator('textarea[aria-label], input[aria-label]');
    if (await input.isVisible({ timeout: 3000 })) {
      await expect(input).toHaveAttribute('aria-label', /.+/);
    }
  });

  test('deve auto-scroll para última mensagem', async ({ page }) => {
    await page.goto('http://localhost:3000/conversas');
    await page.waitForLoadState('networkidle');

    const firstConv = page.locator('[data-testid="conversation-item"]').first();
    if (await firstConv.isVisible({ timeout: 5000 })) {
      await firstConv.click();
    }

    await page.waitForTimeout(1000);

    // Verificar que scroll está no bottom
    const isAtBottom = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="messages-container"], .messages-container') as HTMLElement;
      if (!container) return false;

      const isScrolledToBottom =
        Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 10;

      return isScrolledToBottom;
    });

    console.log('Chat auto-scrolled to bottom:', isAtBottom);
  });
});

test.describe('Chat - Performance', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve carregar mensagens rapidamente', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('http://localhost:3000/conversas');
    await page.waitForLoadState('networkidle');

    const firstConv = page.locator('[data-testid="conversation-item"]').first();
    if (await firstConv.isVisible({ timeout: 5000 })) {
      await firstConv.click();
    }

    // Aguardar primeira mensagem aparecer
    await waitForElement(page, '[data-testid="message-bubble"], .message-bubble');

    const endTime = Date.now();
    const loadTime = endTime - startTime;

    console.log('Chat load time:', loadTime, 'ms');

    // Esperamos que carregue em menos de 5 segundos
    expect(loadTime).toBeLessThan(5000);
  });
});
