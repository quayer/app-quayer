/**
 * Command Parser
 *
 * Sistema de comandos via chat para controlar sessões
 * Inspirado no fluxo N8N - permite operadores controlarem sessões via WhatsApp/Chatwoot
 *
 * Comandos suportados:
 *   @fechar          - Fecha a sessão imediatamente
 *   @pausar [horas]  - Pausa a sessão por X horas (default: 24h)
 *   @reabrir         - Reabre uma sessão pausada/fechada
 *   @blacklist       - Adiciona contato à blacklist (bypass_bots = true)
 *   @whitelist       - Remove contato da blacklist (bypass_bots = false)
 *   @transferir [id] - Transfere sessão para outro departamento/agente
 *   @status          - Retorna status atual da sessão (para debug)
 */

// ===== TIPOS =====

export type CommandType =
  | 'CLOSE'
  | 'PAUSE'
  | 'REOPEN'
  | 'BLACKLIST'
  | 'WHITELIST'
  | 'TRANSFER'
  | 'STATUS'
  | 'NONE';

export interface ParsedCommand {
  type: CommandType;
  raw: string;           // Comando original detectado
  hours?: number;        // Para @pausar
  targetId?: string;     // Para @transferir
  isCommand: boolean;    // true se é um comando válido
}

// ===== REGEX PATTERNS =====

const PATTERNS = {
  CLOSE: /@fechar\b/i,
  PAUSE: /@pausar(?:\s+(\d+))?\b/i,
  REOPEN: /@reabrir\b/i,
  BLACKLIST: /@blacklist\b/i,
  WHITELIST: /@whitelist\b/i,
  TRANSFER: /@transferir(?:\s+(\S+))?\b/i,
  STATUS: /@status\b/i,
} as const;

// ===== PARSER =====

/**
 * Detecta e parseia comandos em uma mensagem de texto
 *
 * @param text Texto da mensagem
 * @returns ParsedCommand com tipo e parâmetros extraídos
 *
 * @example
 * parseCommand("@fechar")        // { type: 'CLOSE', isCommand: true }
 * parseCommand("@pausar 4")      // { type: 'PAUSE', hours: 4, isCommand: true }
 * parseCommand("@pausar")        // { type: 'PAUSE', hours: 24, isCommand: true }
 * parseCommand("Olá, tudo bem?") // { type: 'NONE', isCommand: false }
 */
export function parseCommand(text: string | null | undefined): ParsedCommand {
  const defaultResult: ParsedCommand = {
    type: 'NONE',
    raw: '',
    isCommand: false,
  };

  if (!text) return defaultResult;

  const trimmed = text.trim();

  // @fechar - Fecha sessão
  if (PATTERNS.CLOSE.test(trimmed)) {
    const match = trimmed.match(PATTERNS.CLOSE);
    return {
      type: 'CLOSE',
      raw: match?.[0] || '@fechar',
      isCommand: true,
    };
  }

  // @pausar [horas] - Pausa sessão
  if (PATTERNS.PAUSE.test(trimmed)) {
    const match = trimmed.match(PATTERNS.PAUSE);
    const hours = match?.[1] ? parseInt(match[1], 10) : 24; // Default 24h
    return {
      type: 'PAUSE',
      raw: match?.[0] || '@pausar',
      hours: Math.min(Math.max(hours, 1), 168), // Min 1h, Max 168h (7 dias)
      isCommand: true,
    };
  }

  // @reabrir - Reabre sessão
  if (PATTERNS.REOPEN.test(trimmed)) {
    const match = trimmed.match(PATTERNS.REOPEN);
    return {
      type: 'REOPEN',
      raw: match?.[0] || '@reabrir',
      isCommand: true,
    };
  }

  // @blacklist - Adiciona à blacklist
  if (PATTERNS.BLACKLIST.test(trimmed)) {
    const match = trimmed.match(PATTERNS.BLACKLIST);
    return {
      type: 'BLACKLIST',
      raw: match?.[0] || '@blacklist',
      isCommand: true,
    };
  }

  // @whitelist - Remove da blacklist
  if (PATTERNS.WHITELIST.test(trimmed)) {
    const match = trimmed.match(PATTERNS.WHITELIST);
    return {
      type: 'WHITELIST',
      raw: match?.[0] || '@whitelist',
      isCommand: true,
    };
  }

  // @transferir [id] - Transfere sessão
  if (PATTERNS.TRANSFER.test(trimmed)) {
    const match = trimmed.match(PATTERNS.TRANSFER);
    return {
      type: 'TRANSFER',
      raw: match?.[0] || '@transferir',
      targetId: match?.[1] || undefined,
      isCommand: true,
    };
  }

  // @status - Status da sessão
  if (PATTERNS.STATUS.test(trimmed)) {
    const match = trimmed.match(PATTERNS.STATUS);
    return {
      type: 'STATUS',
      raw: match?.[0] || '@status',
      isCommand: true,
    };
  }

  return defaultResult;
}

/**
 * Verifica se o texto contém algum comando (rápido, sem parse completo)
 */
export function hasCommand(text: string | null | undefined): boolean {
  if (!text) return false;
  return /@(fechar|pausar|reabrir|blacklist|whitelist|transferir|status)\b/i.test(text);
}

/**
 * Lista todos os comandos disponíveis (para help/documentação)
 */
export function getAvailableCommands(): Array<{ command: string; description: string; example: string }> {
  return [
    {
      command: '@fechar',
      description: 'Fecha a sessão imediatamente',
      example: '@fechar',
    },
    {
      command: '@pausar [horas]',
      description: 'Pausa a sessão por X horas (default: 24h, máx: 168h)',
      example: '@pausar 4',
    },
    {
      command: '@reabrir',
      description: 'Reabre uma sessão pausada ou fechada',
      example: '@reabrir',
    },
    {
      command: '@blacklist',
      description: 'Adiciona contato à blacklist (IA não responde)',
      example: '@blacklist',
    },
    {
      command: '@whitelist',
      description: 'Remove contato da blacklist (IA volta a responder)',
      example: '@whitelist',
    },
    {
      command: '@transferir [id]',
      description: 'Transfere sessão para outro departamento/agente',
      example: '@transferir vendas',
    },
    {
      command: '@status',
      description: 'Exibe status atual da sessão (debug)',
      example: '@status',
    },
  ];
}
