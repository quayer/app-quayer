/**
 * message-splitter — Divide texto longo gerado pela IA em blocos amigáveis
 * para envio no WhatsApp.
 *
 * Estratégia:
 *  - Divide por parágrafos (\n\n+).
 *  - Detecta listas (regex em isListBlock) e mantém-as juntas quando possível.
 *  - Parágrafo > maxChars → divide por sentenças (regex de pontuação final).
 *  - Sentença > maxChars → divide por palavras (último recurso).
 *  - Cada bloco recebe um delay_ms calculado a partir do tamanho do conteúdo,
 *    com cap em maxMs. Primeiro bloco SEMPRE tem delay 0.
 *  - config.enabled === false → retorna um único bloco com o texto original.
 *
 * Inspirado no service-original em granvinhas/process-callback/services
 * /message-splitter.ts; aqui mantemos só a parte de divisão de texto puro —
 * a extração de tags interativas vive em tag-parser.service.ts (separação
 * de responsabilidades — o splitter é agnóstico ao conteúdo do bloco).
 */

export type BlockType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'buttons'
  | 'list'
  | 'location'
  | 'flow'
  | 'carousel'
  | 'cta_url';

export interface ButtonItem {
  id: string;
  title: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

export interface LocationData {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface FlowData {
  flow_id?: string;
  flow_name?: string;
  flow_cta: string;
}

export interface CarouselCard {
  header_url: string;
  body: string;
  button_type: 'cta_url' | 'quick_reply';
  button_text: string;
  button_url?: string;
  buttons?: ButtonItem[];
}

export interface CtaUrlData {
  display_text: string;
  url: string;
}

export interface MessageBlock {
  type: BlockType;
  content: string;
  url?: string;
  caption?: string;
  delay_ms?: number;
  index: number;
  buttons?: ButtonItem[];
  list?: { button: string; sections: ListSection[] };
  location?: LocationData;
  flow?: FlowData;
  carousel?: { cards: CarouselCard[] };
  cta_url?: CtaUrlData;
}

export interface SplitConfig {
  enabled: boolean;
  maxChars: number;
  keepListsTogether: boolean;
  useDelay: boolean;
  delays: {
    baseMs: number;
    perCharMs: number;
    maxMs: number;
  };
}

const DEFAULT_CONFIG: SplitConfig = {
  enabled: true,
  maxChars: 800,
  keepListsTogether: true,
  useDelay: true,
  delays: {
    baseMs: 1000,
    perCharMs: 30,
    maxMs: 5000,
  },
};

const LIST_MARKER = /^(\d+[.)]\s|-\s|\*\s|•\s)/;

function mergeConfig(partial?: Partial<SplitConfig>): SplitConfig {
  if (!partial) return { ...DEFAULT_CONFIG, delays: { ...DEFAULT_CONFIG.delays } };
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    delays: { ...DEFAULT_CONFIG.delays, ...(partial.delays ?? {}) },
  };
}

function isListBlock(text: string): boolean {
  const lines = text.split('\n');
  if (lines.length < 2) {
    return LIST_MARKER.test(lines[0]?.trim() ?? '');
  }
  const listLines = lines.filter((line) => LIST_MARKER.test(line.trim()));
  return listLines.length >= lines.length * 0.6;
}

function splitLongList(text: string, maxChars: number): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current = '';
  for (const line of lines) {
    const potential = current + (current ? '\n' : '') + line;
    if (potential.length <= maxChars) {
      current = potential;
    } else {
      if (current) blocks.push(current);
      current = line;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function splitByWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const blocks: string[] = [];
  let current = '';
  for (const word of words) {
    const potential = current + (current ? ' ' : '') + word;
    if (potential.length <= maxChars) {
      current = potential;
    } else {
      if (current) blocks.push(current);
      current = word;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function splitLongParagraph(text: string, maxChars: number): string[] {
  const blocks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) ?? [text];
  let current = '';
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if ((current + ' ' + trimmed).length <= maxChars) {
      current += (current ? ' ' : '') + trimmed;
    } else {
      if (current) blocks.push(current.trim());
      if (trimmed.length > maxChars) {
        blocks.push(...splitByWords(trimmed, maxChars));
        current = '';
      } else {
        current = trimmed;
      }
    }
  }
  if (current) blocks.push(current.trim());
  return blocks;
}

function splitTextIntoBlocks(text: string, config: SplitConfig): string[] {
  const blocks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = '';

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const isList = isListBlock(trimmed);

    if (isList && config.keepListsTogether) {
      if (current && current.length + trimmed.length + 2 > config.maxChars) {
        blocks.push(current.trim());
        current = '';
      }
      if (trimmed.length > config.maxChars) {
        if (current) {
          blocks.push(current.trim());
          current = '';
        }
        blocks.push(...splitLongList(trimmed, config.maxChars));
      } else {
        current += (current ? '\n\n' : '') + trimmed;
      }
    } else {
      const potential = current + (current ? '\n\n' : '') + trimmed;
      if (potential.length <= config.maxChars) {
        current = potential;
      } else {
        if (current) blocks.push(current.trim());
        if (trimmed.length > config.maxChars) {
          blocks.push(...splitLongParagraph(trimmed, config.maxChars));
          current = '';
        } else {
          current = trimmed;
        }
      }
    }
  }

  if (current) blocks.push(current.trim());
  return blocks.filter((b) => b.trim().length > 0);
}

function calculateDelay(content: string, config: SplitConfig): number {
  if (!config.useDelay) return 0;
  const { baseMs, perCharMs, maxMs } = config.delays;
  return Math.min(baseMs + content.length * perCharMs, maxMs);
}

/**
 * Divide o texto em blocos prontos para envio. Cada bloco recebe um índice
 * sequencial (0, 1, 2…) e um delay_ms calculado pelo tamanho do conteúdo.
 * O PRIMEIRO bloco sempre tem delay_ms = 0 (não faz sentido esperar antes de
 * mandar a primeira mensagem).
 */
export function splitMessage(text: string, config?: Partial<SplitConfig>): MessageBlock[] {
  const cfg = mergeConfig(config);
  const trimmed = (text ?? '').trim();

  if (!trimmed) return [];

  if (!cfg.enabled) {
    return [{ type: 'text', content: text, index: 0, delay_ms: 0 }];
  }

  const textBlocks = splitTextIntoBlocks(trimmed, cfg);

  return textBlocks.map((content, idx) => ({
    type: 'text' as BlockType,
    content,
    index: idx,
    delay_ms: idx === 0 ? 0 : calculateDelay(content, cfg),
  }));
}
