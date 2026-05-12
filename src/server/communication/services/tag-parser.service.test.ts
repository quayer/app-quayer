/**
 * tag-parser — unit tests.
 *
 * Cobre os 13 cenários do plano TDD:
 *  1. Texto sem tags → tagsFound vazio, placeholders == texto original
 *  2. [buttons:"Qual?" | Sim | Nao] → 2 botões com ids slugified
 *  3. [list:"Categorias" | Tintos > Cabernet, Merlot] → 1 secao com 2 rows
 *  4. [location:lat,lng | nome | endereco] → lat/lng/name/address
 *  5. [flow:cadastro] → flow_name + flow_cta default "Abrir"
 *  6. [flow:123] (numérico) → flow_id "123"
 *  7. [url da imagem:"URL"] → imagem
 *  8. [carousel:"body" | Card1:img:btn | Card2:img:btn] → 2 cards
 *  9. hasTags retorna true se há QUALQUER tag conhecida
 * 10. stripTags remove todas as tags e colapsa espaços
 * 11. parseTags substitui tags por placeholders __TAG_N__
 * 12. Buttons com > 3 items → truncado para 3
 * 13. Slugify: "Cabernet Sauvignon" → "cabernet_sauvignon"; "Opção 1" → "opcao_1"
 */

import { describe, it, expect } from 'vitest';

import {
  hasTags,
  parseTags,
  slugify,
  stripTags,
} from './tag-parser.service';

describe('parseTags — sem tags', () => {
  it('retorna tagsFound vazio e textWithPlaceholders == texto original', () => {
    const text = 'Apenas um texto comum sem nada de especial.';
    const result = parseTags(text);
    expect(result.tagsFound).toEqual([]);
    expect(result.textWithPlaceholders).toBe(text);
  });
});

describe('parseTags — buttons', () => {
  it('extrai 2 botões com ids slugified de [buttons:"Qual?" | Sim | Nao]', () => {
    const text = '[buttons:"Qual?" | Sim | Nao]';
    const { tagsFound, textWithPlaceholders } = parseTags(text);

    expect(tagsFound).toHaveLength(1);
    const tag = tagsFound[0];
    expect(tag.type).toBe('buttons');
    expect(tag.content).toBe('Qual?');
    expect(tag.buttons).toEqual([
      { id: 'sim', title: 'Sim' },
      { id: 'nao', title: 'Nao' },
    ]);
    expect(textWithPlaceholders).toBe('__TAG_0__');
  });

  it('trunca botões para máximo de 3 quando vêm mais', () => {
    const text = '[buttons:"Escolha" | Um | Dois | Tres | Quatro | Cinco]';
    const { tagsFound } = parseTags(text);
    expect(tagsFound[0].buttons).toHaveLength(3);
    expect(tagsFound[0].buttons?.map((b) => b.title)).toEqual(['Um', 'Dois', 'Tres']);
  });
});

describe('parseTags — list', () => {
  it('extrai 1 seção com 2 rows de [list:"Categorias" | Tintos > Cabernet, Merlot]', () => {
    const text = '[list:"Categorias" | Tintos > Cabernet, Merlot]';
    const { tagsFound } = parseTags(text);

    expect(tagsFound).toHaveLength(1);
    const tag = tagsFound[0];
    expect(tag.type).toBe('list');
    expect(tag.content).toBe('Categorias');
    expect(tag.list?.sections).toHaveLength(1);
    expect(tag.list?.sections[0].title).toBe('Tintos');
    expect(tag.list?.sections[0].rows).toEqual([
      { id: 'cabernet', title: 'Cabernet' },
      { id: 'merlot', title: 'Merlot' },
    ]);
  });
});

describe('parseTags — location', () => {
  it('extrai lat/lng/name/address de [location:lat,lng | nome | endereco]', () => {
    const text = '[location:-29.16,-51.17 | GranVinhas | Vale RS]';
    const { tagsFound } = parseTags(text);

    expect(tagsFound).toHaveLength(1);
    expect(tagsFound[0].type).toBe('location');
    expect(tagsFound[0].location).toEqual({
      latitude: -29.16,
      longitude: -51.17,
      name: 'GranVinhas',
      address: 'Vale RS',
    });
  });
});

describe('parseTags — flow', () => {
  it('[flow:cadastro] extrai flow_name "cadastro" e flow_cta default "Abrir"', () => {
    const { tagsFound } = parseTags('[flow:cadastro]');
    expect(tagsFound).toHaveLength(1);
    expect(tagsFound[0].type).toBe('flow');
    expect(tagsFound[0].flow).toEqual({
      flow_id: undefined,
      flow_name: 'cadastro',
      flow_cta: 'Abrir',
    });
  });

  it('[flow:123] (numérico) extrai flow_id "123" (não flow_name)', () => {
    const { tagsFound } = parseTags('[flow:123]');
    expect(tagsFound[0].flow).toEqual({
      flow_id: '123',
      flow_name: undefined,
      flow_cta: 'Abrir',
    });
  });
});

describe('parseTags — image', () => {
  it('[url da imagem:"..."] extrai imagem com url', () => {
    const text = '[url da imagem:"http://x.com/i.jpg"]';
    const { tagsFound } = parseTags(text);
    expect(tagsFound).toHaveLength(1);
    expect(tagsFound[0].type).toBe('image');
    expect(tagsFound[0].url).toBe('http://x.com/i.jpg');
  });
});

describe('parseTags — carousel', () => {
  it('extrai 2 cards de [carousel:"body" | Card1Body:imgUrl:action | Card2:imgUrl:action]', () => {
    const text =
      '[carousel:"Vinhos" | Malbec:https://img.com/1.jpg:btn1 | Cabernet:https://img.com/2.jpg:btn2]';
    const { tagsFound } = parseTags(text);

    expect(tagsFound).toHaveLength(1);
    expect(tagsFound[0].type).toBe('carousel');
    expect(tagsFound[0].carousel?.cards).toHaveLength(2);
    expect(tagsFound[0].carousel?.cards[0].body).toBe('Malbec');
    expect(tagsFound[0].carousel?.cards[1].body).toBe('Cabernet');
  });
});

describe('hasTags / stripTags / placeholders', () => {
  it('hasTags retorna true para QUALQUER tag conhecida', () => {
    expect(hasTags('Texto [buttons:"a" | b | c] aqui')).toBe(true);
    expect(hasTags('Vai [flow:foo]')).toBe(true);
    expect(hasTags('Sem nenhuma tag aqui mesmo.')).toBe(false);
    expect(hasTags('[url da imagem:"http://x"]')).toBe(true);
  });

  it('stripTags remove TODAS as tags e colapsa espaços', () => {
    const text = 'Olá!  [buttons:"sim?" | Sim | Nao]   Vamos? [flow:start]';
    const out = stripTags(text);
    expect(out).not.toContain('[buttons:');
    expect(out).not.toContain('[flow:');
    // Espaços múltiplos colapsados a 1 só (após remover as tags).
    expect(out).toBe('Olá! Vamos?');
  });

  it('parseTags substitui tags por __TAG_N__ na ordem', () => {
    const text = 'Antes [buttons:"q" | a | b] meio [flow:start] fim';
    const { tagsFound, textWithPlaceholders } = parseTags(text);

    expect(tagsFound).toHaveLength(2);
    // O texto resultante deve ter os 2 placeholders na ordem que aparecem.
    expect(textWithPlaceholders).toContain('__TAG_0__');
    expect(textWithPlaceholders).toContain('__TAG_1__');
    expect(textWithPlaceholders.indexOf('__TAG_0__'))
      .toBeLessThan(textWithPlaceholders.indexOf('__TAG_1__'));
  });
});

describe('slugify', () => {
  it('"Cabernet Sauvignon" → "cabernet_sauvignon"', () => {
    expect(slugify('Cabernet Sauvignon')).toBe('cabernet_sauvignon');
  });

  it('"Opção 1" → "opcao_1" (remove acentos via NFD)', () => {
    expect(slugify('Opção 1')).toBe('opcao_1');
  });

  it('retorna "item" para input só com caracteres não permitidos', () => {
    expect(slugify('!@#$%')).toBe('item');
  });
});
