/**
 * tag-parser — Extrai tags ricas geradas pela IA do texto livre.
 *
 * A IA emite tags inline como [buttons:"corpo" | Op1 | Op2], e este parser
 * converte essas tags em estruturas tipadas para o pipeline de envio do
 * WhatsApp criar botões, listas, localizações, flows e mídia.
 *
 * API pública:
 *  - parseTags(text) → { tagsFound, textWithPlaceholders }
 *  - stripTags(text) → string limpa
 *  - hasTags(text)   → boolean
 *
 * Inspirado em granvinhas/process-callback/services/message-splitter.ts —
 * mantemos a forma das regex e o slugify de IDs (NFD + a-z0-9_).
 */

import type {
  ButtonItem,
  CarouselCard,
  CtaUrlData,
  FlowData,
  ListSection,
  LocationData,
} from './message-splitter.service';

export type TagKind =
  | 'buttons'
  | 'list'
  | 'location'
  | 'flow'
  | 'carousel'
  | 'cta_url'
  | 'document'
  | 'image'
  | 'audio'
  | 'video';

export interface ParsedTag {
  type: TagKind;
  /** Texto principal associado à tag (body de buttons/list, caption de mídia). */
  content?: string;
  /** Trecho original capturado, útil para debug. */
  raw: string;
  url?: string;
  caption?: string;
  buttons?: ButtonItem[];
  list?: { button: string; sections: ListSection[] };
  location?: LocationData;
  flow?: FlowData;
  carousel?: { cards: CarouselCard[] };
  cta_url?: CtaUrlData;
}

// Fábricas de regex (new RegExp) por dois motivos:
//   1. Compatibilidade com bundlers que tropeçam em `\]` em regex literals.
//   2. Cada chamada cria uma instância nova — evita state cross-call em flag /g.
const buildPatterns = () => ({
  document: new RegExp('\\[document:([^\\]|]+)(?:\\|([^\\]]*))?\\]', 'gi'),
  image: new RegExp('\\[url da imagem:"([^"]+)"(?:\\|"([^"]*)")?\\]', 'gi'),
  audio: new RegExp('\\[audio:"([^"]+)"\\]', 'gi'),
  video: new RegExp('\\[video:([^\\]|]+)(?:\\|([^\\]]*))?\\]', 'gi'),
  buttons: new RegExp('\\[buttons:"([^"]*)"\\s*\\|\\s*([^\\]]+)\\]', 'gi'),
  list: new RegExp('\\[list:"([^"]*)"\\s*\\|\\s*([^\\]]+)\\]', 'gi'),
  location: new RegExp(
    '\\[location:\\s*([\\-\\d.]+)\\s*,\\s*([\\-\\d.]+)\\s*\\|\\s*([^|\\]]+)(?:\\|\\s*([^\\]]+))?\\]',
    'gi',
  ),
  flow: new RegExp('\\[flow:\\s*([^|\\]\\s]+)(?:\\s*\\|\\s*([^\\]]+))?\\]', 'gi'),
  carousel: new RegExp('\\[carousel:"([^"]*)"\\s*\\|\\s*([^\\]]+)\\]', 'gi'),
  cta_url: new RegExp('\\[cta:"([^"]*)"\\s*\\|\\s*([^|]+)\\|\\s*([^\\]]+)\\]', 'gi'),
});

/** Gera um id slug a partir de um título — minúsculas, sem acento, sem espaços. */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .substring(0, 200) || 'item'
  );
}

function parseButtonItems(raw: string): ButtonItem[] {
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 3)
    .map((title) => ({
      id: slugify(title),
      title: title.substring(0, 20),
    }));
}

function parseListSections(raw: string): ListSection[] {
  const sections: ListSection[] = [];
  const sectionParts = raw
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const part of sectionParts) {
    const arrowIdx = part.indexOf('>');
    if (arrowIdx < 0) continue;

    const sectionTitle = part.substring(0, arrowIdx).trim();
    const itemsStr = part.substring(arrowIdx + 1).trim();
    if (!sectionTitle || !itemsStr) continue;

    const rows = itemsStr
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((title) => ({
        id: slugify(title),
        title: title.substring(0, 24),
      }));

    if (rows.length > 0) {
      sections.push({ title: sectionTitle.substring(0, 24), rows });
    }
  }
  return sections;
}

function parseCarouselCards(raw: string): CarouselCard[] {
  const cards: CarouselCard[] = [];
  const parts = raw
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const part of parts) {
    const httpIdx = part.indexOf('http');
    if (httpIdx < 0) continue;

    const bodyText = part.substring(0, httpIdx).replace(/:$/, '').trim();
    const rest = part.substring(httpIdx);
    const secondHttpIdx = rest.indexOf('http', 8);

    let imageUrl: string;
    let action: string;
    if (secondHttpIdx > 0) {
      imageUrl = rest.substring(0, secondHttpIdx).replace(/:$/, '').trim();
      action = rest.substring(secondHttpIdx).trim();
    } else {
      const lastColon = rest.lastIndexOf(':');
      if (lastColon > 10) {
        imageUrl = rest.substring(0, lastColon).trim();
        action = rest.substring(lastColon + 1).trim();
      } else {
        imageUrl = rest.trim();
        action = 'Ver';
      }
    }

    if (!imageUrl || !bodyText) continue;

    const isUrl = action.startsWith('http');
    cards.push({
      header_url: imageUrl,
      body: bodyText,
      button_type: isUrl ? 'cta_url' : 'quick_reply',
      button_text: isUrl ? 'Ver' : action,
      button_url: isUrl ? action : undefined,
      buttons: isUrl ? undefined : [{ id: slugify(action), title: action.substring(0, 20) }],
    });
  }

  return cards.slice(0, 10);
}

interface ParseResult {
  tagsFound: ParsedTag[];
  textWithPlaceholders: string;
}

/**
 * Extrai todas as tags ricas e devolve placeholders no formato __TAG_N__.
 * A ORDEM dos placeholders no texto corresponde à ordem em `tagsFound`.
 */
export function parseTags(text: string): ParseResult {
  const tagsFound: ParsedTag[] = [];
  let result = text;
  const patterns = buildPatterns();
  const push = (tag: ParsedTag): string => {
    const idx = tagsFound.length;
    tagsFound.push(tag);
    return `__TAG_${idx}__`;
  };

  result = result.replace(patterns.document, (match, url, caption) =>
    push({
      type: 'document',
      raw: match,
      url: url?.trim(),
      caption: caption?.trim() || undefined,
    }),
  );

  result = result.replace(patterns.image, (match, url, caption) =>
    push({
      type: 'image',
      raw: match,
      url: url?.trim(),
      caption: caption?.trim() || undefined,
    }),
  );

  result = result.replace(patterns.audio, (match, url) =>
    push({
      type: 'audio',
      raw: match,
      url: url?.trim(),
    }),
  );

  result = result.replace(patterns.video, (match, url, caption) =>
    push({
      type: 'video',
      raw: match,
      url: url?.trim(),
      caption: caption?.trim() || undefined,
    }),
  );

  result = result.replace(patterns.buttons, (match, body, titlesPart) => {
    const buttons = parseButtonItems(titlesPart);
    if (buttons.length === 0) return match;
    return push({
      type: 'buttons',
      raw: match,
      content: body?.trim() || '',
      buttons,
    });
  });

  result = result.replace(patterns.list, (match, body, sectionsPart) => {
    const sections = parseListSections(sectionsPart);
    if (sections.length === 0) return match;
    return push({
      type: 'list',
      raw: match,
      content: body?.trim() || '',
      list: { button: 'Ver opcoes', sections },
    });
  });

  result = result.replace(patterns.location, (match, lat, lng, name, address) => {
    const latitude = parseFloat(lat?.trim());
    const longitude = parseFloat(lng?.trim());
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return match;
    return push({
      type: 'location',
      raw: match,
      location: {
        latitude,
        longitude,
        name: name?.trim() || undefined,
        address: address?.trim() || undefined,
      },
    });
  });

  result = result.replace(patterns.flow, (match, idOrName, cta) => {
    const value = idOrName?.trim();
    if (!value) return match;
    const isNumericId = /^\d+$/.test(value);
    return push({
      type: 'flow',
      raw: match,
      flow: {
        flow_id: isNumericId ? value : undefined,
        flow_name: isNumericId ? undefined : value,
        flow_cta: cta?.trim() || 'Abrir',
      },
    });
  });

  result = result.replace(patterns.carousel, (match, body, cardsPart) => {
    const cards = parseCarouselCards(cardsPart);
    if (cards.length < 2) return match;
    return push({
      type: 'carousel',
      raw: match,
      content: body?.trim() || '',
      carousel: { cards },
    });
  });

  result = result.replace(patterns.cta_url, (match, body, displayText, url) => {
    const dt = displayText?.trim();
    const u = url?.trim();
    if (!dt || !u) return match;
    return push({
      type: 'cta_url',
      raw: match,
      content: body?.trim() || '',
      cta_url: { display_text: dt, url: u },
    });
  });

  return { tagsFound, textWithPlaceholders: result };
}

/** Remove TODAS as tags conhecidas e colapsa espaços em branco. */
export function stripTags(text: string): string {
  const patterns = buildPatterns();
  let r = text;
  for (const p of Object.values(patterns)) {
    r = r.replace(p, '');
  }
  return r.replace(/\s+/g, ' ').trim();
}

/** Retorna `true` se houver QUALQUER tag conhecida no texto. */
export function hasTags(text: string): boolean {
  const patterns = buildPatterns();
  for (const p of Object.values(patterns)) {
    if (p.test(text)) return true;
  }
  return false;
}
