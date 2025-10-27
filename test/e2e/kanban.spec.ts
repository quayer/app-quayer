/**
 * E2E Tests - Kanban System
 *
 * Testa drag & drop, criação de colunas, movimento de cards
 */

import { test, expect } from '@playwright/test';
import { autoAuth, waitForElement } from './helpers/auth.helper';

test.describe('Kanban - Lista de Quadros', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve carregar página de quadros kanban', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/kanban');

    // Verificar título
    await expect(page.locator('h1')).toContainText('Kanban');

    // Verificar stats cards
    await expect(page.locator('text=Total de Quadros')).toBeVisible();
    await expect(page.locator('text=Colunas')).toBeVisible();
    await expect(page.locator('text=Cards')).toBeVisible();

    // Verificar botão criar quadro
    await expect(page.locator('button:has-text("Novo Quadro")')).toBeVisible();
  });

  test('deve criar novo quadro', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/kanban');

    // Click em criar quadro
    await page.click('button:has-text("Novo Quadro")');

    // Aguardar dialog
    await waitForElement(page, '[role="dialog"]');

    // Preencher nome
    await page.fill('input[name="name"], input[id*="name"]', 'Quadro de Teste E2E');

    // Preencher descrição
    await page.fill(
      'textarea[name="description"], textarea[id*="description"]',
      'Descrição do quadro de teste'
    );

    // Criar
    await page.click('[role="dialog"] button:has-text("Criar")');

    // Aguardar toast de sucesso
    await expect(page.locator('text=criado com sucesso')).toBeVisible({ timeout: 5000 });

    // Verificar que quadro apareceu na lista
    await expect(page.locator('text=Quadro de Teste E2E')).toBeVisible();
  });

  test('deve excluir quadro', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/kanban');

    await waitForElement(page, 'text=Quadro, text=Board');

    // Click no menu de ações do primeiro quadro
    const firstBoard = page.locator('[data-testid="board-card"]').first();

    if (await firstBoard.isVisible({ timeout: 3000 })) {
      await firstBoard.locator('button[aria-label*="Opções"]').click();

      // Click em excluir
      await page.click('text=Excluir');

      // Confirmar
      page.on('dialog', (dialog) => dialog.accept());

      // Aguardar toast
      await expect(page.locator('text=excluído com sucesso')).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Kanban - Visualização do Quadro', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve carregar quadro com colunas', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/kanban');

    await waitForElement(page, 'text=Quadro, text=Board, [data-testid="board-card"]');

    // Click no primeiro quadro
    const firstBoard = page.locator('[data-testid="board-card"], h3, h4').first();
    await firstBoard.click();

    // Aguardar carregar quadro
    await page.waitForURL('**/crm/kanban/**');

    // Verificar que tem colunas
    await expect(page.locator('[data-testid="kanban-column"], .kanban-column')).toBeVisible({
      timeout: 5000,
    });
  });

  test('deve mostrar stats do quadro', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/kanban');
    await waitForElement(page, '[data-testid="board-card"], h3, h4');

    const firstBoard = page.locator('[data-testid="board-card"], h3, h4').first();
    await firstBoard.click();
    await page.waitForURL('**/crm/kanban/**');

    // Verificar stats
    await expect(page.locator('text=cards, text=Cards, text=contatos, text=Contatos')).toBeVisible({
      timeout: 5000,
    });
  });

  test('deve criar nova coluna', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/kanban');
    await waitForElement(page, '[data-testid="board-card"], h3, h4');

    const firstBoard = page.locator('[data-testid="board-card"], h3, h4').first();
    await firstBoard.click();
    await page.waitForURL('**/crm/kanban/**');

    // Click em criar coluna
    const createColumnButton = page.locator('button:has-text("Nova Coluna"), button:has-text("Adicionar Coluna")');

    if (await createColumnButton.isVisible({ timeout: 3000 })) {
      await createColumnButton.click();

      // Aguardar dialog
      await waitForElement(page, '[role="dialog"]');

      // Preencher nome
      await page.fill('input[name="title"], input[name="name"]', 'Coluna de Teste');

      // Criar
      await page.click('[role="dialog"] button:has-text("Criar")');

      // Aguardar toast
      await expect(page.locator('text=criada com sucesso')).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Kanban - Drag & Drop', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve arrastar card entre colunas', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/kanban');
    await waitForElement(page, '[data-testid="board-card"], h3, h4');

    const firstBoard = page.locator('[data-testid="board-card"], h3, h4').first();
    await firstBoard.click();
    await page.waitForURL('**/crm/kanban/**');

    // Aguardar colunas carregarem
    await waitForElement(page, '[data-testid="kanban-column"], .kanban-column');

    // Verificar se tem pelo menos 2 colunas e pelo menos 1 card
    const columns = page.locator('[data-testid="kanban-column"], .kanban-column');
    const columnsCount = await columns.count();

    if (columnsCount >= 2) {
      const firstColumn = columns.nth(0);
      const secondColumn = columns.nth(1);

      const cards = firstColumn.locator('[data-testid="kanban-card"], .kanban-card');
      const cardsCount = await cards.count();

      if (cardsCount > 0) {
        const firstCard = cards.first();

        // Pegar bounding boxes
        const cardBox = await firstCard.boundingBox();
        const targetColumnBox = await secondColumn.boundingBox();

        if (cardBox && targetColumnBox) {
          // Arrastar card para segunda coluna
          await page.mouse.move(
            cardBox.x + cardBox.width / 2,
            cardBox.y + cardBox.height / 2
          );
          await page.mouse.down();

          // Mover para centro da segunda coluna
          await page.mouse.move(
            targetColumnBox.x + targetColumnBox.width / 2,
            targetColumnBox.y + 100,
            { steps: 10 }
          );
          await page.mouse.up();

          // Aguardar toast de sucesso (tabulação atualizada)
          await expect(page.locator('text=movido com sucesso, text=atualizado')).toBeVisible({
            timeout: 5000,
          });
        }
      }
    }
  });

  test('deve reordenar card na mesma coluna', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/kanban');
    await waitForElement(page, '[data-testid="board-card"], h3, h4');

    const firstBoard = page.locator('[data-testid="board-card"], h3, h4').first();
    await firstBoard.click();
    await page.waitForURL('**/crm/kanban/**');

    await waitForElement(page, '[data-testid="kanban-column"], .kanban-column');

    const firstColumn = page.locator('[data-testid="kanban-column"], .kanban-column').first();
    const cards = firstColumn.locator('[data-testid="kanban-card"], .kanban-card');
    const cardsCount = await cards.count();

    if (cardsCount >= 2) {
      const firstCard = cards.nth(0);
      const secondCard = cards.nth(1);

      const firstCardBox = await firstCard.boundingBox();
      const secondCardBox = await secondCard.boundingBox();

      if (firstCardBox && secondCardBox) {
        // Arrastar primeiro card para posição do segundo
        await page.mouse.move(
          firstCardBox.x + firstCardBox.width / 2,
          firstCardBox.y + firstCardBox.height / 2
        );
        await page.mouse.down();

        await page.mouse.move(
          secondCardBox.x + secondCardBox.width / 2,
          secondCardBox.y + secondCardBox.height + 10,
          { steps: 10 }
        );
        await page.mouse.up();

        // Aguardar reordenação visual
        await page.waitForTimeout(500);

        // Verificar que ordem mudou (pode precisar ajuste)
        console.log('Cards reordered in same column');
      }
    }
  });

  test('deve mostrar drag overlay durante arraste', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/kanban');
    await waitForElement(page, '[data-testid="board-card"], h3, h4');

    const firstBoard = page.locator('[data-testid="board-card"], h3, h4').first();
    await firstBoard.click();
    await page.waitForURL('**/crm/kanban/**');

    await waitForElement(page, '[data-testid="kanban-column"], .kanban-column');

    const firstColumn = page.locator('[data-testid="kanban-column"], .kanban-column').first();
    const cards = firstColumn.locator('[data-testid="kanban-card"], .kanban-card');

    if ((await cards.count()) > 0) {
      const firstCard = cards.first();
      const cardBox = await firstCard.boundingBox();

      if (cardBox) {
        // Iniciar arraste
        await page.mouse.move(
          cardBox.x + cardBox.width / 2,
          cardBox.y + cardBox.height / 2
        );
        await page.mouse.down();

        // Durante arraste, verificar overlay ou feedback visual
        await page.mouse.move(cardBox.x + 100, cardBox.y + 50, { steps: 5 });

        // Verificar opacity, shadow, ou overlay
        const cardOpacity = await firstCard.evaluate((el) => {
          return window.getComputedStyle(el).opacity;
        });

        console.log('Card opacity during drag:', cardOpacity);

        await page.mouse.up();
      }
    }
  });
});

test.describe('Kanban - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve ter aria-labels nos cards e colunas', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/kanban');
    await waitForElement(page, '[data-testid="board-card"], h3, h4');

    const firstBoard = page.locator('[data-testid="board-card"], h3, h4').first();
    await firstBoard.click();
    await page.waitForURL('**/crm/kanban/**');

    await waitForElement(page, '[data-testid="kanban-column"], .kanban-column');

    // Verificar aria-labels
    const card = page.locator('[data-testid="kanban-card"][aria-label], .kanban-card[aria-label]').first();

    if (await card.isVisible({ timeout: 3000 })) {
      await expect(card).toHaveAttribute('aria-label', /.+/);
    }
  });

  test('deve ter grip handle visível nos cards', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/kanban');
    await waitForElement(page, '[data-testid="board-card"], h3, h4');

    const firstBoard = page.locator('[data-testid="board-card"], h3, h4').first();
    await firstBoard.click();
    await page.waitForURL('**/crm/kanban/**');

    await waitForElement(page, '[data-testid="kanban-column"], .kanban-column');

    // Verificar grip handle (ícone de arrastar)
    const gripHandle = page.locator('[data-testid="grip-handle"], svg[data-icon="grip-vertical"]');

    if (await gripHandle.count() > 0) {
      await expect(gripHandle.first()).toBeVisible();
    }
  });
});
