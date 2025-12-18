/**
 * API Type Definitions
 *
 * Centralized type definitions for API responses and data structures.
 * Eliminates `any` types throughout the codebase.
 */

// ============================================
// ORGANIZATION TYPES
// ============================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  document: string;
  documentType: 'CPF' | 'CNPJ';
  email?: string;
  phone?: string;
  maxUsers: number;
  maxInstances: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  // Branding
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;

  // Provider settings
  providerType?: 'UAZAPI' | 'EVOLUTION' | 'BAILEYS' | 'CLOUDAPI';
  providerUrl?: string;
  providerToken?: string;

  // Infrastructure
  dbProvider?: 'quayer' | 'supabase' | 'custom';
  supabaseUrl?: string;
  redisUrl?: string;
}

export interface OrganizationMember {
  userId: string;
  organizationId: string;
  role: 'master' | 'manager' | 'member';
  isActive: boolean;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface OrganizationUpdateInput {
  name?: string;
  slug?: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  providerType?: string;
  providerUrl?: string;
  providerToken?: string;
}

// ============================================
// USER TYPES
// ============================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  isActive: boolean;
  onboardingCompleted: boolean;
  currentOrgId?: string;
  lastOrganizationId?: string;
  createdAt: string;
  updatedAt: string;
  organizations?: UserOrganization[];
}

export interface UserOrganization {
  organizationId: string;
  role: 'master' | 'manager' | 'member';
  isActive: boolean;
  organization: Organization;
}

// ============================================
// INSTANCE/CONNECTION TYPES
// ============================================

export type InstanceStatus = 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR';

export interface Instance {
  id: string;
  name: string;
  description?: string;
  status: InstanceStatus;
  phoneNumber?: string;
  profileName?: string;
  profilePictureUrl?: string;
  organizationId: string;
  uazapiToken?: string;
  uazapiInstanceId?: string;
  providerType: 'UAZAPI' | 'EVOLUTION' | 'BAILEYS' | 'CLOUDAPI';
  cloudApiAccessToken?: string;
  cloudApiPhoneNumberId?: string;
  cloudApiWabaId?: string;
  webhookUrl?: string;
  webhookEvents?: string[];
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface InstanceStatusResponse {
  status: string;
  qrcode?: string;
  pairingCode?: string;
  phoneNumber?: string;
  profileName?: string;
  profilePictureUrl?: string;
}

export interface QRCodeResponse {
  qrcode?: string;
  qr?: string;
  qrCode?: string;
  base64?: string;
  code?: string;
  pairingCode?: string;
  expires?: number;
}

export interface CreateInstanceInput {
  name: string;
  description?: string;
  webhookUrl?: string;
  webhookEvents?: string[];
  provider?: 'WHATSAPP_WEB' | 'WHATSAPP_CLOUD_API';
  cloudApiAccessToken?: string;
  cloudApiPhoneNumberId?: string;
  cloudApiWabaId?: string;
}

// ============================================
// AUTH TYPES
// ============================================

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: 'user' | 'admin';
  currentOrgId?: string;
  organizationRole?: 'master' | 'manager' | 'member';
  needsOnboarding?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  user: User;
  needsOnboarding?: boolean;
}

export interface PasskeyCredential {
  id: string;
  name: string;
  credentialDeviceType: string;
  credentialBackedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  data?: T;
  error?: ApiErrorResponse;
  success?: boolean;
  message?: string;
}

export interface ApiErrorResponse {
  message: string;
  code?: string;
  status?: number;
  details?: Array<{
    field?: string;
    path?: string;
    message: string;
  }>;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// WEBHOOK TYPES
// ============================================

export interface WebhookConfig {
  url: string;
  events: string[];
  excludeMessages?: string[];
  addUrlEvents?: boolean;
  addUrlTypesMessages?: boolean;
}

export interface WebhookEvent {
  id: string;
  event: string;
  instanceId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  processedAt?: string;
  status: 'pending' | 'processed' | 'failed';
}

// ============================================
// NOTIFICATION TYPES
// ============================================

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  targetType: 'all' | 'organization' | 'user';
  targetId?: string;
  scheduledAt?: string;
  sentAt?: string;
  expiresAt?: string;
  status: 'draft' | 'scheduled' | 'sent' | 'cancelled';
  createdBy: string;
  createdAt: string;
}

// ============================================
// INVITATION TYPES
// ============================================

export interface Invitation {
  id: string;
  email: string;
  role: 'user' | 'admin';
  organizationId?: string;
  token: string;
  expiresAt: string;
  acceptedAt?: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  createdAt: string;
  organization?: Organization;
}

// ============================================
// MESSAGE TYPES
// ============================================

export interface Message {
  id: string;
  sessionId: string;
  contactId: string;
  connectionId: string;
  waMessageId?: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact';
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  mimeType?: string;
  fileName?: string;
  transcription?: string;
  transcriptionStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  phoneNumber: string;
  name?: string;
  profilePicUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  contactId: string;
  connectionId: string;
  organizationId: string;
  status: 'ACTIVE' | 'WAITING' | 'CLOSED';
  assignedUserId?: string;
  lastMessageAt?: string;
  createdAt: string;
  contact?: Contact;
}
