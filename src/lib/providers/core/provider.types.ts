/**
 * Provider Types - Normalized Data Structures
 *
 * Tipos normalizados que TODOS os providers devem retornar
 */

// ===== BOT SIGNATURE (Anti-Loop) =====
// DEPRECATED: Zero-width Unicode char approach is fragile and breaks with
// Chatwoot/intermediaries that strip invisible chars. Echo detection is now
// handled via Redis in src/server/communication/services/bot-echo.service.ts.
// These exports are kept temporarily so existing Chatwoot normalizer code
// compiles, but they will be removed in a future cleanup pass.

/** @deprecated Use Redis-based echo detection instead */
export const BOT_SIGNATURE = '\u200B\u200C\u200D';

/** @deprecated Use isBotEcho from bot-echo.service.ts (Redis-based) */
export function isBotEcho(content: string | null | undefined): boolean {
  if (!content) return false;
  return content.startsWith(BOT_SIGNATURE);
}

/** @deprecated No longer needed — echo detection is Redis-based */
export function stripBotSignature(content: string): string {
  if (content.startsWith(BOT_SIGNATURE)) {
    return content.slice(BOT_SIGNATURE.length);
  }
  return content;
}

/** @deprecated Use markBotEcho from bot-echo.service.ts (Redis-based) */
export function addBotSignature(content: string): string {
  return BOT_SIGNATURE + content;
}

// ===== BROKER TYPE =====
export type BrokerType = 'uazapi' | 'cloudapi' | 'instagram';

// ===== PROVIDER CAPABILITIES =====
export enum ProviderCapability {
  MESSAGING = 'messaging',
  INTERACTIVE = 'interactive',
  TEMPLATES = 'templates',
  FLOWS = 'flows',
  BUSINESS_PROFILE = 'business_profile',
  CATALOG = 'catalog',
  MEDIA_MANAGEMENT = 'media_management',
  CHAT_ACTIONS = 'chat_actions',
  LABELS = 'labels',
  CAMPAIGNS = 'campaigns',
  CALLS = 'calls',
  ANALYTICS = 'analytics',
  GROUPS = 'groups',
  CONTACTS = 'contacts',
  WEBHOOKS = 'webhooks',
  INSTANCE_MANAGEMENT = 'instance_management',
  PAYMENTS = 'payments',
  PROFILE = 'profile',
}

// ===== CLOUD API CONFIG =====
/**
 * Configuration for WhatsApp Cloud API (Official Meta API)
 * Used when provider is 'WHATSAPP_CLOUD_API'
 */
export interface CloudAPIConfig {
  /** System User Access Token from Meta Business */
  accessToken: string;
  /** Phone Number ID from WhatsApp Business Manager */
  phoneNumberId: string;
  /** WhatsApp Business Account ID */
  wabaId: string;
  /** Display phone number (e.g., +55 11 99999-0000) */
  displayPhoneNumber?: string;
  /** Verified business name */
  verifiedName?: string;
}

/**
 * Input for creating a Cloud API instance (no QR Code needed)
 */
export interface CreateCloudAPIInstanceInput {
  name: string;
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  phoneNumber?: string;
  webhookUrl?: string;
}

// ===== INSTANCE =====
export interface CreateInstanceInput {
  name: string;
  phoneNumber?: string;
  webhookUrl?: string;
  webhookEvents?: string[];
}

export interface InstanceResult {
  instanceId: string;
  token: string;
  status: InstanceStatus;
  qrCode?: string;
  pairingCode?: string;
}

export type InstanceStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr'
  | 'pairing'
  | 'connected'
  | 'error';

export interface QRCodeResult {
  qrCode: string;
  pairingCode?: string;
  expiresAt?: Date;
}

export interface PairingCodeResult {
  pairingCode: string;
  expiresAt?: Date;
}

// ===== MESSAGES =====
export interface SendTextInput {
  to: string;              // Formato: 5511999887766
  text: string;
  quotedMessageId?: string;
  delay?: number;          // Delay em segundos
}

export interface SendMediaInput {
  to: string;
  mediaType: 'image' | 'video' | 'audio' | 'voice' | 'document';
  mediaUrl?: string;       // URL ou base64
  caption?: string;
  fileName?: string;
  mimeType?: string;
}

export interface SendImageInput {
  to: string;
  imageUrl: string;
  caption?: string;
  quotedMessageId?: string;
}

export interface SendVideoInput {
  to: string;
  videoUrl: string;
  caption?: string;
  quotedMessageId?: string;
}

export interface SendAudioInput {
  to: string;
  audioUrl: string;
  quotedMessageId?: string;
}

export interface SendDocumentInput {
  to: string;
  documentUrl: string;
  fileName: string;
  caption?: string;
  quotedMessageId?: string;
}

export interface SendLocationInput {
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface SendContactInput {
  to: string;
  contact: {
    name: string;
    phone: string;
  };
}

export interface MessageResult {
  messageId: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
}

// ===== MEDIA MESSAGE =====
export interface MediaMessage {
  id: string;
  type: 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker';
  mediaUrl: string;         // URL para download (pode estar vazio se needsDownload=true)
  caption?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;            // Bytes
  duration?: number;        // Segundos (áudio/vídeo)
  needsDownload?: boolean;  // Flag: mídia precisa ser baixada via API

  // Transcrição (será preenchido pelo sistema)
  transcription?: {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    text?: string;
    language?: string;
    confidence?: number;
    processedAt?: Date;
  };
}

// ===== WEBHOOKS =====
export interface NormalizedWebhook {
  event: WebhookEvent;
  instanceId: string;
  timestamp: Date;
  data: WebhookData;
  rawPayload?: any;         // Debug
}

export type WebhookEvent =
  | 'message.received'
  | 'message.sent'
  | 'message.updated'
  | 'instance.connected'
  | 'instance.disconnected'
  | 'instance.qr'
  | 'chat.created'
  | 'contact.updated';

export interface WebhookData {
  chatId?: string;
  from?: string;
  to?: string;
  contactName?: string;  // Nome do contato ou grupo (wa_name no UAZapi)
  pushName?: string;     // Nome do contato no WhatsApp (pushName)
  message?: {
    id: string;
    type: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'document' | 'location' | 'contact' | 'sticker';
    content: string;
    media?: MediaMessage;
    timestamp: Date;
    // Location data (quando type = 'location')
    latitude?: number;
    longitude?: number;
    locationName?: string;
    locationAddress?: string;
    // Group message: author of the message inside the group
    author?: string;
  };
  status?: InstanceStatus;
  qrCode?: string;
  // Group message fields (set by providers for group messages)
  participant?: string;   // JID of who sent the message in a group
  sender?: string;        // Alternative field for participant (some providers)
  author?: string;        // Alternative field for participant (some providers)
  groupName?: string;     // Display name of the group
  subject?: string;       // Alternative field for group name (some providers)
}

// ===== WEBHOOK CONFIG =====
export interface WebhookConfig {
  url: string;
  events: string[];
  enabled?: boolean;
  callbackUrl?: string;
  verifyToken?: string;
}

/**
 * Returned by providers that require manual webhook setup (e.g. Meta Cloud API,
 * Instagram Graph API). Contains human-readable setup instructions and the
 * relevant config values the caller supplied.
 */
export interface WebhookSetupInstructions {
  type: 'manual_setup';
  instructions: string[];
  callbackUrl: string | null;
  verifyToken: string | null;
}

// ===== CHATS & CONTACTS =====
export interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage?: {
    content: string;
    timestamp: Date;
  };
}

export interface Contact {
  id: string;
  name?: string;
  phone: string;
  profilePicUrl?: string;
  isBusiness?: boolean;
}

export interface ChatFilters {
  unreadOnly?: boolean;
  limit?: number;
}

export interface MessageFilters {
  limit?: number;
  beforeTimestamp?: Date;
}

// ===== MENSAGENS INTERATIVAS =====
export interface SendInteractiveListInput {
  to: string;
  title: string;
  description: string;
  buttonText: string;
  sections: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
  footer?: string;
}

export interface SendInteractiveButtonsInput {
  to: string;
  text: string;
  buttons: Array<{
    id: string;
    text: string;
  }>;
  footer?: string;
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    text?: string;
    mediaUrl?: string;
  };
}

// ===== PRESENÇA =====
export type PresenceType = 'composing' | 'recording' | 'paused' | 'available' | 'unavailable';

// ===== MÍDIA =====
export interface MediaDownloadResult {
  data: string; // Base64
  mimeType: string;
  fileName?: string;
  size?: number;
}

// ===== CAROUSEL & MENU (UZAPI) =====
export interface SendCarouselInput {
  to: string;
  text: string;
  carousel: Array<{
    title: string;
    description?: string;
    imageUrl?: string;
    buttons: Array<{ id: string; text: string }>;
  }>;
}

export interface SendMenuInput {
  to: string;
  type: 'poll' | 'list' | 'button';
  text: string;
  title?: string;
  choices: Array<{ id: string; text: string; description?: string }>;
  footer?: string;
}

export interface SendLocationButtonInput {
  to: string;
  text: string;
  footer?: string;
}

export interface SendPollInput {
  to: string;
  title: string;
  options: string[];
  multipleAnswers?: boolean;
}

// ===== TEMPLATES (CloudAPI) =====
export interface Template {
  id: string;
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DISABLED' | 'PAUSED';
  category: string;
  language: string;
  components: TemplateComponent[];
}

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phone_number?: string;
  }>;
}

export interface TemplateListInput {
  limit?: number;
  offset?: number;
  status?: string;
  category?: string;
}

export interface CreateTemplateInput {
  name: string;
  language: string;
  category: string;
  components: TemplateComponent[];
}

export interface SendTemplateInput {
  to: string;
  templateName: string;
  language: string;
  components?: any[];
}

// ===== FLOWS (CloudAPI) =====
export interface Flow {
  id: string;
  name: string;
  status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED' | 'BLOCKED' | 'THROTTLED';
  categories: string[];
  validationErrors?: any[];
}

export interface CreateFlowInput {
  name: string;
  categories: string[];
  endpointUri?: string;
}

export interface SendFlowMessageInput {
  to: string;
  flowId: string;
  flowCta: string;
  mode: 'draft' | 'published';
  flowActionPayload?: Record<string, any>;
  headerText?: string;
  bodyText?: string;
  footerText?: string;
}

// ===== BUSINESS PROFILE =====
export interface BusinessProfile {
  description?: string;
  address?: string;
  email?: string;
  website?: string[];
  profilePictureUrl?: string;
  vertical?: string;
  about?: string;
}

export interface UpdateBusinessProfileInput {
  description?: string;
  address?: string;
  email?: string;
  websites?: string[];
  profilePictureUrl?: string;
  vertical?: string;
  about?: string;
}

// ===== CATALOG =====
export interface CatalogProduct {
  id: string;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  url?: string;
  retailerId?: string;
}

export interface CommerceSettings {
  isCatalogVisible: boolean;
  isCartEnabled: boolean;
}

export interface SendProductMessageInput {
  to: string;
  catalogId: string;
  productRetailerId: string;
  bodyText?: string;
  footerText?: string;
}

export interface SendProductListMessageInput {
  to: string;
  catalogId: string;
  headerText: string;
  bodyText: string;
  sections: Array<{
    title: string;
    productItems: Array<{ productRetailerId: string }>;
  }>;
}

export interface SendCatalogMessageInput {
  to: string;
  bodyText: string;
  footerText?: string;
  thumbnailProductRetailerId?: string;
}

// ===== CHAT ACTIONS (UZAPI) =====
export interface FindChatsInput {
  filter?: Record<string, any>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
  offset?: number;
}

export interface FindMessagesInput {
  chatId: string;
  filter?: Record<string, any>;
  limit?: number;
  offset?: number;
}

export interface PinChatInput {
  chatId: string;
  pin: boolean;
}

export interface MuteChatInput {
  chatId: string;
  muteEndTime: number;
}

export interface ArchiveChatInput {
  chatId: string;
  archive: boolean;
}

export interface BlockContactInput {
  chatId: string;
}

// ===== LABELS (UZAPI) =====
export interface Label {
  id: string;
  name: string;
  color: number;
  count?: number;
}

export interface SetChatLabelsInput {
  chatId: string;
  labelIds: string[];
}

export interface EditLabelInput {
  labelId: string;
  name?: string;
  color?: number;
}

// ===== CONTACTS =====
export interface CheckNumberInput {
  numbers: string[];
}

export interface CheckNumberResult {
  number: string;
  exists: boolean;
  jid?: string;
}

export interface ChatDetails {
  id: string;
  name?: string;
  image?: string;
  imagePreview?: string;
  phone?: string;
  isBusiness?: boolean;
  description?: string;
}

export interface AddContactInput {
  name: string;
  phone: string;
}

export interface ContactListInput {
  page?: number;
  pageSize?: number;
}

// ===== CAMPAIGNS (UZAPI Sender) =====
export interface BulkSimpleInput {
  numbers: string[];
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  text?: string;
  mediaUrl?: string;
  fileName?: string;
  folder: string;
  delayMin: number;
  delayMax: number;
}

export interface BulkAdvancedInput {
  messages: Array<{
    number: string;
    type: 'text' | 'image' | 'video' | 'audio' | 'document';
    text?: string;
    mediaUrl?: string;
    fileName?: string;
  }>;
  folder: string;
  delayMin: number;
  delayMax: number;
}

export interface CampaignFolder {
  name: string;
  info?: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  totalMessages: number;
  sentMessages: number;
  failedMessages: number;
}

export interface CampaignMessage {
  number: string;
  status: 'queued' | 'sending' | 'done' | 'failed';
  type: string;
  text?: string;
  error?: string;
}

// ===== CALLS (UZAPI) =====
export interface MakeCallInput {
  to: string;
  isVideo?: boolean;
}

// ===== ANALYTICS (CloudAPI) =====
export interface AnalyticsInput {
  start: string;
  end: string;
  granularity?: 'HALF_HOUR' | 'DAY' | 'MONTH';
  phoneNumbers?: string[];
  countryCodes?: string[];
  metricTypes?: string[];
}

export interface AnalyticsResult {
  dataPoints: Array<{
    start: string;
    end: string;
    sent: number;
    delivered: number;
    read?: number;
    cost?: number;
  }>;
}

export interface ConversationAnalyticsResult {
  dataPoints: Array<{
    start: string;
    end: string;
    conversation: number;
    cost: number;
  }>;
}

// ===== GROUPS =====
export interface CreateGroupInput {
  name: string;
  participants: string[];
  description?: string;
}

export interface GroupInfo {
  id: string;
  name: string;
  description?: string;
  participants: Array<{ id: string; admin: boolean }>;
  size: number;
  creation: number;
  owner?: string;
  inviteCode?: string;
}

export interface UpdateGroupParticipantsInput {
  groupId: string;
  participants: string[];
  action: 'add' | 'remove' | 'promote' | 'demote';
}

// ===== MEDIA MANAGEMENT (CloudAPI) =====
export interface UploadMediaInput {
  file: Buffer | string;
  mimeType: string;
  fileName?: string;
}

export interface MediaInfo {
  id: string;
  url?: string;
  mimeType: string;
  sha256?: string;
  fileSize?: number;
}

// ===== PAYMENTS (UZAPI) =====
export interface SendPixButtonInput {
  to: string;
  pixType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  pixKey: string;
  pixName: string;
  text?: string;
}

export interface SendPaymentRequestInput {
  to: string;
  title: string;
  text: string;
  itemName: string;
  invoiceNumber: string;
  amount: number;
  pixKey: string;
  pixType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  pixName: string;
}

// ===== STATUS/STORIES (UZAPI) =====
export interface SendStatusInput {
  type: 'text' | 'video' | 'image' | 'audio' | 'ptt';
  text?: string;
  backgroundColor?: number; // 1-19
  font?: number; // 0-9
  file?: string; // URL or base64
}

// ===== MESSAGE EDITING =====
export interface EditMessageInput {
  messageId: string;
  text: string;
}

// ===== PRIVACY SETTINGS (UZAPI) =====
export type PrivacyValue = 'all' | 'contacts' | 'contact_blacklist' | 'none';

export interface PrivacySettings {
  groupadd?: PrivacyValue;
  last?: PrivacyValue;
  status?: PrivacyValue;
  profile?: PrivacyValue;
  readreceipts?: PrivacyValue;
  online?: PrivacyValue;
  calladd?: PrivacyValue;
}

// ===== PROXY CONFIG (UZAPI) =====
export interface ProxyConfig {
  enable: boolean;
  proxyUrl?: string;
}

// ===== QUICK REPLIES (UZAPI provider-level) =====
export interface QuickReply {
  id?: string;
  shortCut: string;
  text: string;
  type: 'text' | 'audio' | 'ptt' | 'document' | 'video' | 'image';
  file?: string;
  docName?: string;
}

// ===== LEAD DATA (UZAPI CRM) =====
export interface LeadData {
  id: string;
  lead_name?: string;
  lead_fullName?: string;
  lead_email?: string;
  lead_status?: string;
  lead_tags?: string[];
  lead_notes?: string;
  lead_disableChatBotUntil?: string;
  lead_isTicketOpen?: boolean;
  lead_assignedAgent_id?: string;
  [key: string]: any; // Custom fields lead_field01-10
}
