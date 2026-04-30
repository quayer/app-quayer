/**
 * Provider Capability Interfaces
 *
 * Sistema modular: cada provider implementa apenas as interfaces que suporta.
 * Use hasCapability() / assertCapability() de capability-helpers.ts para checar em runtime.
 */

import type {
  // Instance
  CreateInstanceInput,
  InstanceResult,
  InstanceStatus,
  QRCodeResult,
  PairingCodeResult,
  // Messages
  SendTextInput,
  SendMediaInput,
  SendImageInput,
  SendVideoInput,
  SendAudioInput,
  SendDocumentInput,
  SendLocationInput,
  SendContactInput,
  MessageResult,
  // Interactive
  SendInteractiveListInput,
  SendInteractiveButtonsInput,
  SendCarouselInput,
  SendMenuInput,
  SendLocationButtonInput,
  SendPollInput,
  // Presence
  PresenceType,
  // Media
  MediaDownloadResult,
  // Webhooks
  WebhookConfig,
  WebhookSetupInstructions,
  NormalizedWebhook,
  // Chats & Contacts
  Chat,
  Contact,
  ChatFilters,
  // Templates
  Template,
  TemplateListInput,
  CreateTemplateInput,
  SendTemplateInput,
  // Flows
  Flow,
  CreateFlowInput,
  SendFlowMessageInput,
  // Business
  BusinessProfile,
  UpdateBusinessProfileInput,
  // Catalog
  CatalogProduct,
  CommerceSettings,
  SendProductMessageInput,
  SendProductListMessageInput,
  SendCatalogMessageInput,
  // Chat Actions
  FindChatsInput,
  FindMessagesInput,
  PinChatInput,
  MuteChatInput,
  ArchiveChatInput,
  BlockContactInput,
  // Labels
  Label,
  SetChatLabelsInput,
  EditLabelInput,
  // Contacts
  CheckNumberInput,
  CheckNumberResult,
  ChatDetails,
  AddContactInput,
  ContactListInput,
  // Campaigns
  BulkSimpleInput,
  BulkAdvancedInput,
  CampaignFolder,
  CampaignMessage,
  // Calls
  MakeCallInput,
  // Analytics
  AnalyticsInput,
  AnalyticsResult,
  ConversationAnalyticsResult,
  // Groups
  CreateGroupInput,
  GroupInfo,
  UpdateGroupParticipantsInput,
  // Media Management
  UploadMediaInput,
  MediaInfo,
  // Payments
  SendPixButtonInput,
  SendPaymentRequestInput,
} from './provider.types';

// ===== INSTANCE MANAGEMENT =====
export interface IInstanceCapability {
  createInstance(data: CreateInstanceInput): Promise<InstanceResult>;
  deleteInstance(instanceId: string): Promise<void>;
  getInstanceStatus(instanceId: string): Promise<InstanceStatus>;
  generateQRCode(instanceId: string): Promise<QRCodeResult>;
  getPairingCode(instanceId: string, phone?: string): Promise<PairingCodeResult>;
  disconnect(instanceId: string): Promise<void>;
  restart(instanceId: string): Promise<void>;
}

// ===== MESSAGING =====
export interface IMessagingCapability {
  sendText(instanceId: string, data: SendTextInput): Promise<MessageResult>;
  sendMedia(instanceId: string, data: SendMediaInput): Promise<MessageResult>;
  sendImage(instanceId: string, data: SendImageInput): Promise<MessageResult>;
  sendVideo(instanceId: string, data: SendVideoInput): Promise<MessageResult>;
  sendAudio(instanceId: string, data: SendAudioInput): Promise<MessageResult>;
  sendDocument(instanceId: string, data: SendDocumentInput): Promise<MessageResult>;
  sendLocation(instanceId: string, data: SendLocationInput): Promise<MessageResult>;
  sendContact(instanceId: string, data: SendContactInput): Promise<MessageResult>;
  markAsRead(instanceId: string, messageId: string): Promise<void>;
  reactToMessage(instanceId: string, messageId: string, emoji: string): Promise<void>;
  deleteMessage(instanceId: string, messageId: string): Promise<void>;
  sendPresence(instanceId: string, to: string, type: PresenceType): Promise<void>;
  downloadMedia(instanceId: string, messageId: string): Promise<MediaDownloadResult>;
}

// ===== INTERACTIVE =====
export interface IInteractiveCapability {
  sendInteractiveList(instanceId: string, data: SendInteractiveListInput): Promise<MessageResult>;
  sendInteractiveButtons(instanceId: string, data: SendInteractiveButtonsInput): Promise<MessageResult>;
  sendCarousel(instanceId: string, data: SendCarouselInput): Promise<MessageResult>;
  sendMenu(instanceId: string, data: SendMenuInput): Promise<MessageResult>;
  sendLocationButton?(instanceId: string, data: SendLocationButtonInput): Promise<MessageResult>;
  sendPollMessage?(instanceId: string, data: SendPollInput): Promise<MessageResult>;
}

// ===== WEBHOOKS =====
export interface IWebhookCapability {
  /**
   * Configure webhook for the given instance.
   *
   * Returns `void` when the provider configures the webhook automatically
   * (e.g. UAZapi), or a `WebhookSetupInstructions` object when the provider
   * requires manual setup in an external dashboard (e.g. Meta Cloud API,
   * Instagram Graph API).
   */
  configureWebhook(instanceId: string, config: WebhookConfig): Promise<WebhookSetupInstructions | void>;
  normalizeWebhook(rawWebhook: any): NormalizedWebhook;
}

// ===== PROFILE =====
export interface IProfileCapability {
  getProfilePicture(instanceId: string, number: string): Promise<string | null>;
  updateProfilePicture(instanceId: string, imageUrl: string): Promise<void>;
}

// ===== TEMPLATES (CloudAPI) =====
export interface ITemplateCapability {
  listTemplates(instanceId: string, input?: TemplateListInput): Promise<Template[]>;
  getTemplate(instanceId: string, templateId: string): Promise<Template>;
  createTemplate(instanceId: string, input: CreateTemplateInput): Promise<Template>;
  editTemplate(instanceId: string, templateId: string, input: Partial<CreateTemplateInput>): Promise<Template>;
  deleteTemplate(instanceId: string, templateId: string): Promise<void>;
  sendTemplate(instanceId: string, input: SendTemplateInput): Promise<MessageResult>;
}

// ===== FLOWS (CloudAPI) =====
export interface IFlowCapability {
  listFlows(instanceId: string): Promise<Flow[]>;
  getFlow(instanceId: string, flowId: string): Promise<Flow>;
  createFlow(instanceId: string, input: CreateFlowInput): Promise<Flow>;
  updateFlow(instanceId: string, flowId: string, input: Partial<CreateFlowInput>): Promise<Flow>;
  updateFlowJSON(instanceId: string, flowId: string, jsonContent: string | Record<string, any>): Promise<void>;
  publishFlow(instanceId: string, flowId: string): Promise<void>;
  deprecateFlow(instanceId: string, flowId: string): Promise<void>;
  deleteFlow(instanceId: string, flowId: string): Promise<void>;
  sendFlowMessage(instanceId: string, input: SendFlowMessageInput): Promise<MessageResult>;
}

// ===== BUSINESS PROFILE =====
export interface IBusinessCapability {
  getBusinessProfile(instanceId: string): Promise<BusinessProfile>;
  updateBusinessProfile(instanceId: string, input: UpdateBusinessProfileInput): Promise<void>;
  getBusinessCategories?(instanceId: string): Promise<string[]>;
}

// ===== CATALOG =====
export interface ICatalogCapability {
  listProducts(instanceId: string): Promise<CatalogProduct[]>;
  getProductInfo(instanceId: string, productId: string): Promise<CatalogProduct>;
  showProduct?(instanceId: string, productId: string): Promise<void>;
  hideProduct?(instanceId: string, productId: string): Promise<void>;
  deleteProduct?(instanceId: string, productId: string): Promise<void>;
  sendProductMessage?(instanceId: string, input: SendProductMessageInput): Promise<MessageResult>;
  sendProductListMessage?(instanceId: string, input: SendProductListMessageInput): Promise<MessageResult>;
  sendCatalogMessage?(instanceId: string, input: SendCatalogMessageInput): Promise<MessageResult>;
  getCommerceSettings?(instanceId: string): Promise<CommerceSettings>;
  updateCommerceSettings?(instanceId: string, settings: Partial<CommerceSettings>): Promise<void>;
}

// ===== CHAT ACTIONS (UZAPI) =====
export interface IChatActionsCapability {
  findChats(instanceId: string, input: FindChatsInput): Promise<Chat[]>;
  findMessages(instanceId: string, input: FindMessagesInput): Promise<any[]>;
  pinChat(instanceId: string, input: PinChatInput): Promise<void>;
  muteChat(instanceId: string, input: MuteChatInput): Promise<void>;
  archiveChat(instanceId: string, input: ArchiveChatInput): Promise<void>;
  markChatRead(instanceId: string, chatId: string): Promise<void>;
  deleteChat(instanceId: string, chatId: string): Promise<void>;
  blockContact(instanceId: string, input: BlockContactInput): Promise<void>;
  unblockContact(instanceId: string, chatId: string): Promise<void>;
  getBlockList(instanceId: string): Promise<string[]>;
}

// ===== LABELS (UZAPI) =====
export interface ILabelCapability {
  getLabels(instanceId: string): Promise<Label[]>;
  setChatLabels(instanceId: string, input: SetChatLabelsInput): Promise<void>;
  editLabel(instanceId: string, input: EditLabelInput): Promise<void>;
  deleteLabel(instanceId: string, labelId: string): Promise<void>;
}

// ===== CONTACTS =====
export interface IContactCapability {
  checkNumber(instanceId: string, input: CheckNumberInput): Promise<CheckNumberResult[]>;
  getChatDetails(instanceId: string, chatId: string): Promise<ChatDetails>;
  addContact(instanceId: string, input: AddContactInput): Promise<void>;
  removeContact(instanceId: string, phone: string): Promise<void>;
  listContactsPaginated(instanceId: string, input: ContactListInput): Promise<Contact[]>;
  getContacts(instanceId: string): Promise<Contact[]>;
}

// ===== CAMPAIGNS (UZAPI Sender) =====
export interface ICampaignCapability {
  sendBulkSimple(instanceId: string, input: BulkSimpleInput): Promise<void>;
  sendBulkAdvanced(instanceId: string, input: BulkAdvancedInput): Promise<void>;
  listCampaignFolders(instanceId: string): Promise<CampaignFolder[]>;
  listCampaignMessages(instanceId: string, folder: string): Promise<CampaignMessage[]>;
  editCampaignFolder(instanceId: string, folder: string, action: 'stop' | 'continue' | 'delete'): Promise<void>;
  clearCompletedCampaigns(instanceId: string): Promise<void>;
  clearAllCampaigns(instanceId: string): Promise<void>;
}

// ===== CALLS (UZAPI) =====
export interface ICallCapability {
  makeCall(instanceId: string, input: MakeCallInput): Promise<void>;
  rejectCall(instanceId: string, callId: string): Promise<void>;
}

// ===== ANALYTICS (CloudAPI) =====
export interface IAnalyticsCapability {
  getAnalytics(instanceId: string, input: AnalyticsInput): Promise<AnalyticsResult>;
  getConversationAnalytics(instanceId: string, input: AnalyticsInput): Promise<ConversationAnalyticsResult>;
}

// ===== GROUPS =====
export interface IGroupCapability {
  createGroup(instanceId: string, input: CreateGroupInput): Promise<GroupInfo>;
  listGroups(instanceId: string): Promise<GroupInfo[]>;
  getGroupInfo(instanceId: string, groupId: string): Promise<GroupInfo>;
  updateGroupName(instanceId: string, groupId: string, name: string): Promise<void>;
  updateGroupDescription(instanceId: string, groupId: string, description: string): Promise<void>;
  updateGroupImage(instanceId: string, groupId: string, imageUrl: string): Promise<void>;
  updateGroupSettings?(instanceId: string, groupId: string, settings: Record<string, any>): Promise<void>;
  updateGroupParticipants(instanceId: string, input: UpdateGroupParticipantsInput): Promise<void>;
  getGroupInviteLink(instanceId: string, groupId: string): Promise<string>;
  joinGroup?(instanceId: string, inviteCode: string): Promise<void>;
  leaveGroup(instanceId: string, groupId: string): Promise<void>;
}

// ===== MEDIA MANAGEMENT (CloudAPI) =====
export interface IMediaManagementCapability {
  uploadMedia(instanceId: string, input: UploadMediaInput): Promise<MediaInfo>;
  getMediaInfo(instanceId: string, mediaId: string): Promise<MediaInfo>;
  deleteMedia(instanceId: string, mediaId: string): Promise<void>;
}

// ===== PAYMENTS (UZAPI) =====
export interface IPaymentCapability {
  sendPixButton(instanceId: string, input: SendPixButtonInput): Promise<MessageResult>;
  sendPaymentRequest(instanceId: string, input: SendPaymentRequestInput): Promise<MessageResult>;
}
