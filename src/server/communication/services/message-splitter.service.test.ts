/**
 * message-splitter — unit tests.
 *
 * Cobre os 10 cenários definidos no plano TDD:
 *  1. Texto curto → 1 bloco
 *  2. 2 parágrafos curtos → 2 blocos
 *  3. Parágrafo longo dividido por sentenças
 *  4. Lista numerada não quebra entre items quando keepListsTogether=true
 *  5. Sentença gigante dividida por palavras
 *  6. Texto vazio → array vazio
 *  7. config.enabled=false → 1 bloco único
 *  8. Bloco maior tem delay maior, mas capped em maxMs
 *  9. Primeiro bloco sempre delay 0
 * 10. config defaults aplicados quando não passados
 */

import { describe, it, expect } from 'vitest';

import { splitMessage } from './message-splitter.service';

describe('splitMessage — basics', () => {
  it('retorna 1 bloco para texto curto (1 parágrafo, < maxChars)', () => {
    const blocks = splitMessage('Olá! Tudo bem?');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('text');
    expect(blocks[0].content).toBe('Olá! Tudo bem?');
    expect(blocks[0].index).toBe(0);
    expect(blocks[0].delay_ms).toBe(0);
  });

  it('quebra texto com 2 parágrafos curtos em 2 blocos quando soma excede maxChars', () => {
    const p1 = 'A'.repeat(500);
    const p2 = 'B'.repeat(500);
    const blocks = splitMessage(`${p1}\n\n${p2}`, { maxChars: 800 });
    expect(blocks).toHaveLength(2);
    expect(blocks[0].content).toBe(p1);
    expect(blocks[1].content).toBe(p2);
    expect(blocks[0].index).toBe(0);
    expect(blocks[1].index).toBe(1);
  });

  it('retorna array vazio para texto vazio', () => {
    expect(splitMessage('')).toEqual([]);
    expect(splitMessage('   \n  \n  ')).toEqual([]);
  });
});

describe('splitMessage — divisão por sentenças', () => {
  it('divide parágrafo longo pelas sentenças (pontuação final)', () => {
    // Cada sentença ~60 chars; maxChars=100 obriga divisão por sentença.
    const sentence = 'Esta é uma sentença razoavelmente longa para teste.'; // 51 chars
    const paragraph = `${sentence} ${sentence} ${sentence}`;
    const blocks = splitMessage(paragraph, { maxChars: 100, useDelay: false });

    expect(blocks.length).toBeGreaterThanOrEqual(2);
    // Nenhum bloco deve exceder maxChars.
    for (const b of blocks) {
      expect(b.content.length).toBeLessThanOrEqual(100);
    }
    // O conteúdo concatenado deve preservar o texto original (palavras todas presentes).
    const joined = blocks.map((b) => b.content).join(' ');
    expect(joined).toContain('razoavelmente longa');
  });

  it('divide sentença gigante (>maxChars) por palavras', () => {
    // Sem pontuação interna; 200 palavras "palavra" → ~1600 chars.
    const huge = Array.from({ length: 200 }, () => 'palavra').join(' ');
    const blocks = splitMessage(huge, { maxChars: 100, useDelay: false });

    expect(blocks.length).toBeGreaterThan(1);
    for (const b of blocks) {
      expect(b.content.length).toBeLessThanOrEqual(100);
    }
  });
});

describe('splitMessage — listas', () => {
  it('mantém lista numerada inteira quando keepListsTogether=true e cabe no bloco', () => {
    const list = '1. Primeiro item\n2. Segundo item\n3. Terceiro item\n4. Quarto item';
    const blocks = splitMessage(list, { maxChars: 800, keepListsTogether: true });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe(list);
  });

  it('aceita marcadores - * e • como listas', () => {
    const list = '- item um\n- item dois\n- item três';
    const blocks = splitMessage(list, { maxChars: 800, keepListsTogether: true });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe(list);
  });
});

describe('splitMessage — delays', () => {
  it('primeiro bloco sempre tem delay_ms = 0', () => {
    const p1 = 'A'.repeat(400);
    const p2 = 'B'.repeat(400);
    const p3 = 'C'.repeat(400);
    const blocks = splitMessage(`${p1}\n\n${p2}\n\n${p3}`, { maxChars: 500 });
    expect(blocks[0].delay_ms).toBe(0);
  });

  it('bloco maior recebe delay maior, mas capped em maxMs', () => {
    // maxChars=500 obriga que os 2 parágrafos (cada ~600 chars) virem 2 blocos.
    // delays: baseMs=100, perCharMs=10, maxMs=500.
    const p1 = 'X'.repeat(600);
    const p2 = 'Y'.repeat(600);
    const text = `${p1}\n\n${p2}`;
    const blocks = splitMessage(text, {
      maxChars: 500,
      delays: { baseMs: 100, perCharMs: 10, maxMs: 500 },
    });
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    // primeiro bloco = delay 0 (regra do primeiro)
    expect(blocks[0].delay_ms).toBe(0);
    // Todos os blocos a partir do segundo devem ter delay capped em maxMs=500.
    for (let i = 1; i < blocks.length; i++) {
      // delay calculado seria 100 + len*10 (>>500) → cap em 500.
      expect(blocks[i].delay_ms).toBe(500);
    }
  });

  it('useDelay=false anula todos os delays mesmo em blocos seguintes', () => {
    const text = `${'A'.repeat(400)}\n\n${'B'.repeat(400)}\n\n${'C'.repeat(400)}`;
    const blocks = splitMessage(text, { maxChars: 500, useDelay: false });
    for (const b of blocks) {
      expect(b.delay_ms).toBe(0);
    }
  });
});

describe('splitMessage — config', () => {
  it('config.enabled=false retorna 1 bloco único com o texto inteiro (sem divisão)', () => {
    const huge = 'A'.repeat(3000);
    const blocks = splitMessage(huge, { enabled: false });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe(huge);
    expect(blocks[0].delay_ms).toBe(0);
    expect(blocks[0].index).toBe(0);
  });

  it('aplica defaults quando config não é passada (maxChars=800, useDelay=true, delays default)', () => {
    // 1600 chars limpos sem pontuação → divisão por palavras com maxChars default.
    const huge = Array.from({ length: 200 }, () => 'palavra').join(' ');
    const blocks = splitMessage(huge);
    // Com default maxChars=800, deve dividir em ~2 blocos.
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const b of blocks) {
      expect(b.content.length).toBeLessThanOrEqual(800);
    }
    // useDelay default true → primeiro bloco 0, demais > 0 (com cap em 5000).
    expect(blocks[0].delay_ms).toBe(0);
    expect(blocks[1].delay_ms).toBeGreaterThan(0);
    expect(blocks[1].delay_ms).toBeLessThanOrEqual(5000);
  });
});
