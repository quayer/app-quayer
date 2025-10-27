/**
 * Messages Feature - TypeScript Interfaces
 * Tipos e interfaces para mensagens e chats
 */

// Interface para Chat (Conversa)
export interface Chat {
  wa_chatid: string;
  wa_name: string | null;
  wa_profilePicUrl: string | null;
  wa_isGroup: boolean;
  wa_lastMsgTimestamp: number;
  wa_lastMsgBody: string | null;
  wa_unreadCount: number;
  wa_isPinned: boolean;
  wa_isArchived: boolean;
  wa_isMuted: boolean;
  lead_status: string | null;
  lead_source: string | null;
  created_at: string;
  updated_at: string;
}

// Interface para Mensagem
export interface Message {
  id: string;
  wa_msgid: string;
  wa_chatid: string;
  wa_from: string;
  wa_fromMe: boolean;
  wa_body: string | null;
  wa_type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact' | 'ptt';
  wa_timestamp: number;
  wa_isForwarded: boolean;
  wa_hasMedia: boolean;
  wa_mediaUrl: string | null;
  wa_caption: string | null;
  wa_fileName: string | null;
  wa_quotedMsg: string | null;
  wa_ack: number; // 0=sent, 1=delivered, 2=read, 3=played
  track_id: string | null;
  track_source: string | null;
  created_at: string;
}

// Interface para resposta de listagem de chats
export interface ListChatsResponse {
  success: boolean;
  chats: Chat[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// Interface para resposta de listagem de mensagens
export interface ListMessagesResponse {
  success: boolean;
  messages: Message[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// Interface para resposta de envio de mensagem
export interface SendMessageResponse {
  success: boolean;
  message: {
    id: string;
    wa_msgid: string;
    wa_chatid: string;
    wa_timestamp: number;
    ack: number;
  };
}

// Interface para contadores de chat (UAZapi /chat/count)
export interface ChatCounters {
  total_chats: number;
  unread_chats: number;
  groups: number;
  pinned_chats: number;
}
