--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AgentDeployMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AgentDeployMode" AS ENUM (
    'CHAT',
    'N8N',
    'CLAUDE_CODE'
);


--
-- Name: AgentDeployStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AgentDeployStatus" AS ENUM (
    'ACTIVE',
    'PAUSED',
    'DRAFT'
);


--
-- Name: AgentToolType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AgentToolType" AS ENUM (
    'BUILTIN',
    'CUSTOM',
    'MCP'
);


--
-- Name: AutoPauseBehavior; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AutoPauseBehavior" AS ENUM (
    'CLOSE_SESSION',
    'WAIT_CUSTOMER'
);


--
-- Name: BillingCycle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BillingCycle" AS ENUM (
    'MONTHLY',
    'QUARTERLY',
    'YEARLY'
);


--
-- Name: BuilderContextSnapshotTrigger; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BuilderContextSnapshotTrigger" AS ENUM (
    'auto',
    'manual',
    'exhausted'
);


--
-- Name: BuilderDeploymentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BuilderDeploymentStatus" AS ENUM (
    'pending',
    'publishing',
    'instance_creating',
    'attaching',
    'live',
    'failed',
    'rolled_back'
);


--
-- Name: BuilderProjectMessageRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BuilderProjectMessageRole" AS ENUM (
    'user',
    'assistant',
    'tool',
    'system_banner'
);


--
-- Name: BuilderProjectStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BuilderProjectStatus" AS ENUM (
    'draft',
    'production',
    'paused',
    'archived'
);


--
-- Name: BuilderProjectType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BuilderProjectType" AS ENUM (
    'ai_agent'
);


--
-- Name: BuilderPromptVersionCreatedBy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BuilderPromptVersionCreatedBy" AS ENUM (
    'chat',
    'manual',
    'rollback'
);


--
-- Name: BuilderToolCallStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BuilderToolCallStatus" AS ENUM (
    'pending',
    'success',
    'error',
    'approved',
    'rejected'
);


--
-- Name: Channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Channel" AS ENUM (
    'WHATSAPP',
    'INSTAGRAM',
    'TELEGRAM',
    'EMAIL'
);


--
-- Name: ConnectionEventType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ConnectionEventType" AS ENUM (
    'CONNECTED',
    'DISCONNECTED',
    'CONNECTION_LOST',
    'QR_GENERATED',
    'QR_SCANNED',
    'QR_TIMEOUT',
    'QR_RETRY',
    'ERROR',
    'RECONNECTING'
);


--
-- Name: ConnectionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ConnectionStatus" AS ENUM (
    'CONNECTED',
    'CONNECTING',
    'DISCONNECTED',
    'ERROR'
);


--
-- Name: DeviceAuthStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DeviceAuthStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'DENIED',
    'EXPIRED'
);


--
-- Name: GeoAlertMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GeoAlertMode" AS ENUM (
    'off',
    'notify',
    'block'
);


--
-- Name: IntegrationType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."IntegrationType" AS ENUM (
    'OPENAI',
    'ANTHROPIC',
    'GROQ',
    'TOGETHER_AI',
    'OLLAMA',
    'DEEPGRAM',
    'WHISPER_API',
    'ASSEMBLY_AI',
    'SUPABASE',
    'AWS_S3',
    'CLOUDFLARE_R2',
    'POSTGRESQL',
    'REDIS',
    'MONGODB',
    'UAZAPI',
    'CHATWOOT',
    'WHATSAPP_CLOUD',
    'TELEGRAM',
    'MESSENGER',
    'CUSTOM'
);


--
-- Name: InvoiceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InvoiceStatus" AS ENUM (
    'DRAFT',
    'PENDING',
    'PROCESSING',
    'PAID',
    'OVERDUE',
    'CANCELED',
    'REFUNDED'
);


--
-- Name: LogLevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LogLevel" AS ENUM (
    'DEBUG',
    'INFO',
    'WARN',
    'ERROR',
    'CRITICAL'
);


--
-- Name: MessageAuthor; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MessageAuthor" AS ENUM (
    'CUSTOMER',
    'AGENT',
    'AI',
    'BUSINESS',
    'SYSTEM',
    'AGENT_PLATFORM'
);


--
-- Name: MessageDirection; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MessageDirection" AS ENUM (
    'INBOUND',
    'OUTBOUND'
);


--
-- Name: MessageStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MessageStatus" AS ENUM (
    'pending',
    'sent',
    'delivered',
    'read',
    'failed'
);


--
-- Name: MessageType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MessageType" AS ENUM (
    'text',
    'image',
    'video',
    'audio',
    'voice',
    'document',
    'location',
    'contact',
    'sticker',
    'poll',
    'list',
    'buttons'
);


--
-- Name: NfseStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NfseStatus" AS ENUM (
    'PENDING_NFSE',
    'SCHEDULED',
    'SYNCHRONIZED',
    'AUTHORIZED',
    'PROCESSING_CANCELLATION',
    'CANCELED',
    'CANCELLATION_DENIED',
    'ERROR_NFSE'
);


--
-- Name: NotificationType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationType" AS ENUM (
    'MESSAGE',
    'USER',
    'WARNING',
    'INFO',
    'SUCCESS',
    'ERROR',
    'SYSTEM',
    'CONNECTION'
);


--
-- Name: PaymentGateway; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PaymentGateway" AS ENUM (
    'EFI',
    'ASAAS'
);


--
-- Name: PaymentMethod; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PaymentMethod" AS ENUM (
    'PIX_AUTO',
    'PIX_MANUAL',
    'CREDIT_CARD',
    'BOLETO'
);


--
-- Name: PromptVersionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PromptVersionStatus" AS ENUM (
    'ACTIVE',
    'TESTING',
    'ARCHIVED'
);


--
-- Name: Provider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Provider" AS ENUM (
    'WHATSAPP_WEB',
    'WHATSAPP_CLOUD_API',
    'WHATSAPP_BUSINESS_API',
    'INSTAGRAM_META',
    'TELEGRAM_BOT',
    'EMAIL_SMTP'
);


--
-- Name: ProviderCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProviderCategory" AS ENUM (
    'AI',
    'TRANSCRIPTION',
    'TTS',
    'INFRASTRUCTURE',
    'AUXILIARY'
);


--
-- Name: SessionStartedBy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionStartedBy" AS ENUM (
    'CUSTOMER',
    'BUSINESS',
    'AGENT'
);


--
-- Name: SessionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionStatus" AS ENUM (
    'QUEUED',
    'ACTIVE',
    'PAUSED',
    'CLOSED'
);


--
-- Name: SubscriptionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SubscriptionStatus" AS ENUM (
    'TRIAL',
    'ACTIVE',
    'PAST_DUE',
    'CANCELED',
    'SUSPENDED'
);


--
-- Name: TranscriptionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TranscriptionStatus" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'skipped'
);


--
-- Name: WebhookEventStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."WebhookEventStatus" AS ENUM (
    'RECEIVED',
    'PROCESSING',
    'PROCESSED',
    'FAILED'
);


SET default_table_access_method = heap;

--
-- Name: AIAgentConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIAgentConfig" (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    provider text DEFAULT 'openai'::text NOT NULL,
    model text DEFAULT 'gpt-4o'::text NOT NULL,
    temperature double precision DEFAULT 0.7 NOT NULL,
    "maxTokens" integer DEFAULT 4096 NOT NULL,
    "systemPrompt" text,
    personality text,
    "agentTarget" text,
    "agentBehavior" text,
    "agentAvatar" text,
    "useMemory" boolean DEFAULT true NOT NULL,
    "memoryWindow" integer DEFAULT 10 NOT NULL,
    "useRAG" boolean DEFAULT false NOT NULL,
    "ragCollectionId" text,
    "enabledTools" text[] DEFAULT ARRAY[]::text[],
    "enableTTS" boolean DEFAULT false NOT NULL,
    "ttsProvider" text,
    "ttsVoiceId" text,
    "ttsModel" text,
    "ttsSpeechRate" double precision DEFAULT 1.0,
    "callbackUrl" text,
    "callbackSecret" text,
    "totalInputTokens" integer DEFAULT 0 NOT NULL,
    "totalOutputTokens" integer DEFAULT 0 NOT NULL,
    "totalCachedTokens" integer DEFAULT 0 NOT NULL,
    "totalCost" double precision DEFAULT 0 NOT NULL,
    "totalCacheSavings" double precision DEFAULT 0 NOT NULL,
    "totalCalls" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: AIPrompt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIPrompt" (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    prompt text NOT NULL,
    model text,
    "isActive" boolean DEFAULT true NOT NULL,
    "usageCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "updatedBy" text
);


--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    action text NOT NULL,
    resource text NOT NULL,
    "resourceId" text,
    "userId" text NOT NULL,
    "organizationId" text,
    metadata jsonb,
    "ipAddress" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ChatSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ChatSession" (
    id text NOT NULL,
    "contactPhone" text NOT NULL,
    "connectionId" text NOT NULL,
    "organizationId" text NOT NULL,
    status public."SessionStatus" DEFAULT 'QUEUED'::public."SessionStatus" NOT NULL,
    "startedBy" public."SessionStartedBy" DEFAULT 'CUSTOMER'::public."SessionStartedBy" NOT NULL,
    "statusReason" text,
    "endReason" text,
    "externalId" text,
    "assignedDepartmentId" text,
    "assignedAgentId" text,
    "assignedCustomerId" text,
    "aiEnabled" boolean DEFAULT true NOT NULL,
    "aiBlockedUntil" timestamp(3) without time zone,
    "aiBlockReason" text,
    "aiAgentConfigId" text,
    "aiAgentId" text,
    "aiAgentName" text,
    "aiAgentTarget" text,
    "aiAgentBehavior" text,
    "aiAgentContext" jsonb,
    "pinnedAgentVersion" integer,
    "customerJourney" text DEFAULT 'new'::text,
    "journeyStage" text,
    "journeyUpdatedAt" timestamp(3) without time zone,
    "leadScore" integer,
    "conversionProbability" double precision,
    "totalMessages" integer DEFAULT 0 NOT NULL,
    "totalAiMessages" integer DEFAULT 0 NOT NULL,
    "totalAgentMessages" integer DEFAULT 0 NOT NULL,
    "totalMediaMessages" integer DEFAULT 0 NOT NULL,
    "avgResponseTime" integer,
    "sessionDuration" integer,
    "totalAiCost" double precision DEFAULT 0 NOT NULL,
    "lastMessageAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastMessageAuthorId" text,
    "expiresAt" timestamp(3) without time zone,
    "pausedUntil" timestamp(3) without time zone,
    "pausedBy" text,
    "lastCustomerMessageAt" timestamp(3) without time zone,
    "whatsappWindowExpiresAt" timestamp(3) without time zone,
    "whatsappWindowType" text DEFAULT 'CUSTOMER_INITIATED'::text,
    "isConcat" boolean DEFAULT false NOT NULL,
    "concatTimeout" integer DEFAULT 8 NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[],
    "customFields" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "closedAt" timestamp(3) without time zone
);


--
-- Name: Department; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Department" (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    type text DEFAULT 'support'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: DeviceSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DeviceSession" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "deviceName" text,
    "ipAddress" text,
    "userAgent" text,
    location text,
    "countryCode" text,
    "lastActiveAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isRevoked" boolean DEFAULT false NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: EmailTemplate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EmailTemplate" (
    id text NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    "htmlContent" text NOT NULL,
    "textContent" text,
    variables text[],
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "updatedBy" text
);


--
-- Name: File; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."File" (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    "fileName" text NOT NULL,
    "fileSize" integer NOT NULL,
    "mimeType" text NOT NULL,
    url text NOT NULL,
    thumbnail text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: IntegrationConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."IntegrationConfig" (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    type public."IntegrationType" NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "apiKey" text,
    "apiSecret" text,
    "apiUrl" text,
    "webhookUrl" text,
    "webhookSecret" text,
    settings jsonb,
    metadata jsonb,
    "rateLimit" integer,
    "rateLimitPeriod" integer,
    "lastHealthCheck" timestamp(3) without time zone,
    "healthStatus" text DEFAULT 'unknown'::text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Invitation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Invitation" (
    id text NOT NULL,
    email text NOT NULL,
    token text NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    "organizationId" text NOT NULL,
    "invitedById" text NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Message" (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    "contactPhone" text NOT NULL,
    "connectionId" text NOT NULL,
    "waMessageId" text NOT NULL,
    direction public."MessageDirection" NOT NULL,
    type public."MessageType" NOT NULL,
    author public."MessageAuthor" DEFAULT 'CUSTOMER'::public."MessageAuthor" NOT NULL,
    content text NOT NULL,
    "rawContent" text,
    "formattedContent" text,
    "mediaUrl" text,
    "mediaType" text,
    "mimeType" text,
    "fileName" text,
    "mediaSize" integer,
    "mediaDuration" integer,
    latitude double precision,
    longitude double precision,
    "locationName" text,
    "geoAddress" text,
    "geoNeighborhood" text,
    "geoCity" text,
    "geoState" text,
    "geoStateCode" text,
    "geoPostalCode" text,
    "geoCountry" text,
    transcription text,
    "transcriptionLanguage" text,
    "transcriptionConfidence" double precision,
    "transcriptionStatus" public."TranscriptionStatus" DEFAULT 'pending'::public."TranscriptionStatus" NOT NULL,
    "transcriptionProcessedAt" timestamp(3) without time zone,
    "transcriptionError" text,
    status public."MessageStatus" DEFAULT 'pending'::public."MessageStatus" NOT NULL,
    "sentAt" timestamp(3) without time zone,
    "deliveredAt" timestamp(3) without time zone,
    "readAt" timestamp(3) without time zone,
    "isConcatenated" boolean DEFAULT false NOT NULL,
    "concatGroupId" text,
    "aiModel" text,
    "aiAgentId" text,
    "aiAgentName" text,
    "inputTokens" integer,
    "outputTokens" integer,
    "cachedTokens" integer,
    "inputCost" double precision,
    "outputCost" double precision,
    "cacheSavings" double precision,
    "totalCost" double precision,
    "aiLatency" integer,
    "aiProvider" text,
    "callbackSource" text,
    "callbackPayload" jsonb,
    "quotedMessageId" text,
    "isForwarded" boolean DEFAULT false NOT NULL,
    "forwardedInfo" jsonb,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Organization; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Organization" (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    document text,
    type text NOT NULL,
    "maxInstances" integer DEFAULT 1 NOT NULL,
    "maxUsers" integer DEFAULT 1 NOT NULL,
    "billingType" text DEFAULT 'free'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "businessHoursStart" text,
    "businessHoursEnd" text,
    "businessDays" text,
    timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
    "sessionTimeoutHours" integer DEFAULT 24 NOT NULL,
    "notificationsEnabled" boolean DEFAULT true NOT NULL,
    "balancedDistribution" boolean DEFAULT true NOT NULL,
    "typingIndicator" boolean DEFAULT true NOT NULL,
    "profanityFilter" boolean DEFAULT false NOT NULL,
    "autoGreeting" boolean DEFAULT false NOT NULL,
    "greetingMessage" text,
    "autoPauseBehavior" public."AutoPauseBehavior" DEFAULT 'WAIT_CUSTOMER'::public."AutoPauseBehavior" NOT NULL,
    "autoPauseWaitMinutes" integer DEFAULT 30 NOT NULL,
    "autoPauseDurationMinutes" integer DEFAULT 15 NOT NULL,
    "logoUrl" text,
    "primaryColor" text DEFAULT '#000000'::text NOT NULL,
    "secondaryColor" text,
    "supportEmail" text,
    "customDomain" text,
    "geoAlertMode" public."GeoAlertMode" DEFAULT 'off'::public."GeoAlertMode" NOT NULL,
    "providerType" text DEFAULT 'quayer'::text NOT NULL,
    "uazapiUrl" text,
    "uazapiKey" text,
    "smtpConfig" jsonb,
    "useOwnOpenAI" boolean DEFAULT false NOT NULL,
    "useOwnRedis" boolean DEFAULT false NOT NULL,
    "useOwnDatabase" boolean DEFAULT false NOT NULL,
    "useOwnStorage" boolean DEFAULT false NOT NULL,
    vertical text,
    "agentLanguage" text DEFAULT 'pt-BR'::text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PasskeyChallenge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PasskeyChallenge" (
    id text NOT NULL,
    challenge text NOT NULL,
    "userId" text,
    email text,
    type text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: PasskeyCredential; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PasskeyCredential" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "credentialId" text NOT NULL,
    "publicKey" bytea NOT NULL,
    counter bigint DEFAULT 0 NOT NULL,
    "credentialDeviceType" text DEFAULT 'singleDevice'::text NOT NULL,
    "credentialBackedUp" boolean DEFAULT false NOT NULL,
    transports text[],
    name text DEFAULT 'Minha Passkey'::text NOT NULL,
    aaguid text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastUsedAt" timestamp(3) without time zone
);


--
-- Name: Project; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Project" (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    "organizationId" text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: RefreshToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RefreshToken" (
    id text NOT NULL,
    "userId" text NOT NULL,
    token text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Session" (
    id text NOT NULL,
    "userId" text NOT NULL,
    token text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: SystemSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SystemSettings" (
    id text NOT NULL,
    category text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    encrypted boolean DEFAULT false NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "updatedBy" text
);


--
-- Name: TempUser; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TempUser" (
    id text NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    password text,
    name text NOT NULL,
    "emailVerified" timestamp(3) without time zone,
    "currentOrgId" text,
    role text DEFAULT 'user'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "onboardingCompleted" boolean DEFAULT false NOT NULL,
    phone text,
    "phoneVerified" boolean DEFAULT false NOT NULL,
    "twoFactorEnabled" boolean DEFAULT false NOT NULL,
    "isAgency" boolean DEFAULT false NOT NULL,
    language text DEFAULT 'pt-BR'::text,
    timezone text DEFAULT 'America/Sao_Paulo'::text,
    "avatarUrl" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: UserOrganization; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserOrganization" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "organizationId" text NOT NULL,
    role text NOT NULL,
    "customRoleId" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: UserPreferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserPreferences" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "messageSignature" jsonb,
    "aiSuggestionsEnabled" boolean DEFAULT true NOT NULL,
    "otpEmailDisabled" boolean DEFAULT false NOT NULL,
    "otpPhoneDisabled" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: VerificationCode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VerificationCode" (
    id text NOT NULL,
    "userId" text,
    identifier text NOT NULL,
    code text NOT NULL,
    type text NOT NULL,
    token text,
    used boolean DEFAULT false NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Webhook; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Webhook" (
    id text NOT NULL,
    url text NOT NULL,
    events text[],
    description text,
    secret text,
    "isActive" boolean DEFAULT true NOT NULL,
    "connectionId" text,
    "organizationId" text,
    "excludeMessages" boolean DEFAULT false NOT NULL,
    "addUrlEvents" boolean DEFAULT false NOT NULL,
    "addUrlTypesMessages" text[] DEFAULT ARRAY[]::text[],
    "pathParams" jsonb,
    "maxRetries" integer DEFAULT 3 NOT NULL,
    "retryDelay" integer DEFAULT 5000 NOT NULL,
    timeout integer DEFAULT 30000 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: WebhookDelivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WebhookDelivery" (
    id text NOT NULL,
    "webhookId" text NOT NULL,
    event text NOT NULL,
    payload jsonb NOT NULL,
    response jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone
);


--
-- Name: agent_deployments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_deployments (
    id text NOT NULL,
    "agentConfigId" text NOT NULL,
    "connectionId" text NOT NULL,
    mode public."AgentDeployMode" DEFAULT 'CHAT'::public."AgentDeployMode" NOT NULL,
    status public."AgentDeployStatus" DEFAULT 'DRAFT'::public."AgentDeployStatus" NOT NULL,
    config jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: agent_prompt_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_prompt_versions (
    id text NOT NULL,
    "agentConfigId" text NOT NULL,
    version integer NOT NULL,
    "systemPrompt" text NOT NULL,
    "isActive" boolean DEFAULT false NOT NULL,
    status public."PromptVersionStatus" DEFAULT 'ARCHIVED'::public."PromptVersionStatus" NOT NULL,
    changelog text,
    "createdBy" text,
    "totalMessages" integer DEFAULT 0 NOT NULL,
    "totalTransfers" integer DEFAULT 0 NOT NULL,
    "totalCost" double precision DEFAULT 0 NOT NULL,
    "avgResponseTime" double precision DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: agent_tools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_tools (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    type public."AgentToolType" DEFAULT 'CUSTOM'::public."AgentToolType" NOT NULL,
    parameters jsonb,
    "webhookUrl" text,
    "webhookSecret" text,
    "webhookTimeout" integer DEFAULT 10000 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id text NOT NULL,
    name text NOT NULL,
    "keyHash" text NOT NULL,
    prefix text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    scopes text[] DEFAULT ARRAY['read'::text],
    "expiresAt" timestamp(3) without time zone,
    "lastUsedAt" timestamp(3) without time zone,
    "lastUsedIp" text,
    "usageCount" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "revokedBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: builder_context_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.builder_context_snapshots (
    id text NOT NULL,
    "conversationId" text NOT NULL,
    summary text NOT NULL,
    "messagesCompacted" integer NOT NULL,
    "tokensBefore" integer,
    "tokensAfter" integer,
    "tokensReclaimed" integer,
    "triggeredBy" public."BuilderContextSnapshotTrigger" DEFAULT 'auto'::public."BuilderContextSnapshotTrigger" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: builder_deployments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.builder_deployments (
    id text NOT NULL,
    "projectId" text NOT NULL,
    "aiAgentId" text NOT NULL,
    "promptVersionId" text NOT NULL,
    "instanceId" text,
    "connectionId" text,
    status public."BuilderDeploymentStatus" DEFAULT 'pending'::public."BuilderDeploymentStatus" NOT NULL,
    "failureStep" text,
    "failureReason" text,
    "rolledBack" boolean DEFAULT false NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "triggeredBy" text NOT NULL
);


--
-- Name: builder_project_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.builder_project_conversations (
    id text NOT NULL,
    "projectId" text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    "stateSummary" text,
    "lastMessageAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: builder_project_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.builder_project_messages (
    id text NOT NULL,
    "conversationId" text NOT NULL,
    role public."BuilderProjectMessageRole" NOT NULL,
    content text NOT NULL,
    "toolCalls" jsonb,
    "toolResults" jsonb,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: builder_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.builder_projects (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    type public."BuilderProjectType" DEFAULT 'ai_agent'::public."BuilderProjectType" NOT NULL,
    name character varying(255) NOT NULL,
    status public."BuilderProjectStatus" DEFAULT 'draft'::public."BuilderProjectStatus" NOT NULL,
    "aiAgentId" text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "archivedAt" timestamp(3) without time zone
);


--
-- Name: builder_prompt_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.builder_prompt_versions (
    id text NOT NULL,
    "aiAgentId" text NOT NULL,
    "versionNumber" integer NOT NULL,
    content text NOT NULL,
    description character varying(500),
    "createdBy" public."BuilderPromptVersionCreatedBy" DEFAULT 'chat'::public."BuilderPromptVersionCreatedBy" NOT NULL,
    "publishedAt" timestamp(3) without time zone,
    "publishedBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: builder_tool_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.builder_tool_calls (
    id text NOT NULL,
    "messageId" text NOT NULL,
    "toolName" character varying(100) NOT NULL,
    input jsonb NOT NULL,
    output jsonb,
    status public."BuilderToolCallStatus" DEFAULT 'pending'::public."BuilderToolCallStatus" NOT NULL,
    "errorMessage" text,
    "tokensIn" integer,
    "tokensOut" integer,
    "latencyMs" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: campaign_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_recipients (
    id text NOT NULL,
    "campaignId" text NOT NULL,
    "contactId" text,
    "phoneNumber" text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    "sentAt" timestamp(3) without time zone,
    error text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "connectionId" text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    "scheduledAt" timestamp(3) without time zone,
    message text NOT NULL,
    "mediaUrl" text,
    "recipientCount" integer DEFAULT 0 NOT NULL,
    "sentCount" integer DEFAULT 0 NOT NULL,
    "failedCount" integer DEFAULT 0 NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: connection_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connection_events (
    id text NOT NULL,
    "connectionId" text NOT NULL,
    "eventType" public."ConnectionEventType" NOT NULL,
    "fromStatus" public."ConnectionStatus",
    "toStatus" public."ConnectionStatus" NOT NULL,
    reason text,
    metadata jsonb,
    "ipAddress" text,
    "userAgent" text,
    "triggeredBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: connection_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connection_settings (
    id text NOT NULL,
    "connectionId" text NOT NULL,
    "concatEnabled" boolean DEFAULT true NOT NULL,
    "concatTimeoutMs" integer DEFAULT 8000 NOT NULL,
    "concatMaxMessages" integer DEFAULT 10 NOT NULL,
    "concatSameType" boolean DEFAULT false NOT NULL,
    "concatSameSender" boolean DEFAULT true NOT NULL,
    "transcriptionEnabled" boolean DEFAULT true NOT NULL,
    "imageDescriptionEnabled" boolean DEFAULT true NOT NULL,
    "documentAnalysisEnabled" boolean DEFAULT true NOT NULL,
    "videoTranscriptionEnabled" boolean DEFAULT true NOT NULL,
    "geocodingEnabled" boolean DEFAULT true NOT NULL,
    "geocodingApiKey" text,
    "transcriptionModel" text,
    "visionModel" text,
    "analysisModel" text,
    "imagePrompt" text,
    "audioPrompt" text,
    "documentPrompt" text,
    "videoPrompt" text,
    "enforceWhatsAppWindow" boolean DEFAULT true NOT NULL,
    "templateFallbackEnabled" boolean DEFAULT false NOT NULL,
    "botEchoEnabled" boolean DEFAULT true NOT NULL,
    "botSignature" text,
    "autoPauseOnHumanReply" boolean DEFAULT true NOT NULL,
    "autoPauseDurationHours" integer DEFAULT 24 NOT NULL,
    "commandsEnabled" boolean DEFAULT true NOT NULL,
    "commandPrefix" text DEFAULT '@'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connections (
    id text NOT NULL,
    name text NOT NULL,
    channel public."Channel" DEFAULT 'WHATSAPP'::public."Channel" NOT NULL,
    provider public."Provider" DEFAULT 'WHATSAPP_WEB'::public."Provider" NOT NULL,
    status public."ConnectionStatus" DEFAULT 'DISCONNECTED'::public."ConnectionStatus" NOT NULL,
    "phoneNumber" text,
    "profileName" text,
    "profilePictureUrl" text,
    "isBusiness" boolean DEFAULT false NOT NULL,
    "uazapiInstanceId" text,
    "uazapiToken" text,
    "qrCode" text,
    "pairingCode" text,
    "lastConnected" timestamp(3) without time zone,
    "lastDisconnect" timestamp(3) without time zone,
    "lastDisconnectReason" text,
    cloud_api_access_token text,
    cloud_api_phone_number_id text,
    cloud_api_waba_id text,
    cloud_api_verified_name text,
    "n8nWebhookUrl" text,
    "n8nWorkflowId" text,
    "n8nFallbackUrl" text,
    "agentConfig" jsonb,
    "organizationId" text,
    "projectId" text,
    "assignedCustomerId" text,
    "msgDelayMin" integer DEFAULT 2 NOT NULL,
    "msgDelayMax" integer DEFAULT 4 NOT NULL,
    "shareToken" text,
    "shareTokenExpiresAt" timestamp(3) without time zone,
    "shareTokenExtensionCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: custom_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_roles (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    permissions jsonb NOT NULL,
    "isSystem" boolean DEFAULT false NOT NULL,
    priority integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: device_auth_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_auth_requests (
    id text NOT NULL,
    "deviceCode" text NOT NULL,
    "userCode" text NOT NULL,
    scopes text[] DEFAULT ARRAY['read'::text, 'write'::text],
    "keyName" text DEFAULT 'CLI'::text NOT NULL,
    status public."DeviceAuthStatus" DEFAULT 'PENDING'::public."DeviceAuthStatus" NOT NULL,
    "apiKeyId" text,
    "apiKeyPlaintext" text,
    "userId" text,
    "organizationId" text,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id text NOT NULL,
    "subscriptionId" text NOT NULL,
    "organizationId" text NOT NULL,
    number integer NOT NULL,
    description text NOT NULL,
    "totalCents" integer NOT NULL,
    status public."InvoiceStatus" DEFAULT 'PENDING'::public."InvoiceStatus" NOT NULL,
    "issuedAt" timestamp(3) without time zone NOT NULL,
    "dueDate" timestamp(3) without time zone NOT NULL,
    "paidAt" timestamp(3) without time zone,
    gateway public."PaymentGateway" NOT NULL,
    "gatewayPaymentId" text,
    "gatewayPixTxId" text,
    "nfseStatus" public."NfseStatus",
    "nfseId" text,
    "nfseUrl" text,
    "pdfUrl" text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: invoices_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoices_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoices_number_seq OWNED BY public.invoices.number;


--
-- Name: log_analyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log_analyses (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "periodStart" timestamp(3) without time zone NOT NULL,
    "periodEnd" timestamp(3) without time zone NOT NULL,
    type text NOT NULL,
    summary text NOT NULL,
    patterns jsonb NOT NULL,
    anomalies jsonb NOT NULL,
    suggestions jsonb NOT NULL,
    metrics jsonb NOT NULL,
    severity integer DEFAULT 0 NOT NULL,
    "aiModel" text,
    "aiTokens" integer,
    "aiCost" double precision,
    "aiLatency" integer
);


--
-- Name: log_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log_entries (
    id text NOT NULL,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    level public."LogLevel" DEFAULT 'INFO'::public."LogLevel" NOT NULL,
    source text NOT NULL,
    action text,
    message text NOT NULL,
    details text,
    "stackTrace" text,
    context jsonb,
    metadata jsonb,
    "requestId" text,
    "requestPath" text,
    "requestMethod" text,
    "statusCode" integer,
    duration integer,
    "userId" text,
    "organizationId" text,
    "connectionId" text,
    "sessionId" text,
    "ipAddress" text,
    "userAgent" text,
    "aiAnalysis" text,
    "aiAnalyzedAt" timestamp(3) without time zone,
    "aiPatternMatch" text,
    "aiSeverity" integer DEFAULT 0,
    "aiSuggestion" text,
    tags text[] DEFAULT ARRAY[]::text[]
);


--
-- Name: message_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_templates (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "connectionId" text,
    name text NOT NULL,
    category text DEFAULT 'UTILITY'::text NOT NULL,
    language text DEFAULT 'pt_BR'::text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "headerType" text DEFAULT 'NONE'::text NOT NULL,
    "headerContent" text,
    body text NOT NULL,
    footer text,
    buttons jsonb,
    "metaTemplateId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: n8n_call_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n8n_call_logs (
    id text NOT NULL,
    "connectionId" text NOT NULL,
    url text NOT NULL,
    payload jsonb NOT NULL,
    success boolean NOT NULL,
    "statusCode" integer,
    response jsonb,
    error text,
    latency integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    "userId" text NOT NULL,
    "emailSecurity" boolean DEFAULT true NOT NULL,
    "emailProduct" boolean DEFAULT true NOT NULL,
    "emailMarketing" boolean DEFAULT false NOT NULL,
    "pushEnabled" boolean DEFAULT false NOT NULL,
    "pushMentions" boolean DEFAULT true NOT NULL,
    "pushDeployments" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: notification_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_reads (
    id text NOT NULL,
    "notificationId" text NOT NULL,
    "userId" text NOT NULL,
    "readAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "userId" text,
    "organizationId" text,
    role text,
    "isGlobal" boolean DEFAULT false NOT NULL,
    type public."NotificationType" NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    "actionUrl" text,
    "actionLabel" text,
    source text,
    "sourceId" text,
    metadata jsonb,
    "scheduledFor" timestamp(3) without time zone,
    "expiresAt" timestamp(3) without time zone,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: organization_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_providers (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    category public."ProviderCategory" NOT NULL,
    provider text NOT NULL,
    "builderProjectId" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "isPrimary" boolean DEFAULT false NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    credentials jsonb NOT NULL,
    settings jsonb,
    "lastTestedAt" timestamp(3) without time zone,
    "lastTestStatus" text,
    "lastTestError" text,
    "usageThisMonth" integer DEFAULT 0 NOT NULL,
    "costThisMonth" double precision DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: permission_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permission_resources (
    id text NOT NULL,
    resource text NOT NULL,
    "displayName" text NOT NULL,
    description text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    "priceMonthly" integer NOT NULL,
    "priceYearly" integer,
    currency text DEFAULT 'BRL'::text NOT NULL,
    "maxUsers" integer NOT NULL,
    "maxInstances" integer NOT NULL,
    "maxMessages" integer NOT NULL,
    "maxStorage" integer NOT NULL,
    "maxAiCredits" integer NOT NULL,
    "maxContacts" integer NOT NULL,
    "hasWebhooks" boolean DEFAULT false NOT NULL,
    "hasApi" boolean DEFAULT false NOT NULL,
    "hasCustomRoles" boolean DEFAULT false NOT NULL,
    "hasSso" boolean DEFAULT false NOT NULL,
    "hasAiAgents" boolean DEFAULT false NOT NULL,
    "hasPrioritySupport" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "isFree" boolean DEFAULT false NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: recovery_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recovery_codes (
    id text NOT NULL,
    "userId" text NOT NULL,
    code text NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id text NOT NULL,
    "resourceId" text NOT NULL,
    role text NOT NULL,
    actions text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: short_link_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.short_link_clicks (
    id text NOT NULL,
    "shortLinkId" text NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "countryCode" text,
    "clickedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: short_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.short_links (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "originalUrl" text NOT NULL,
    slug text NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    "createdById" text NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "planId" text NOT NULL,
    status public."SubscriptionStatus" DEFAULT 'ACTIVE'::public."SubscriptionStatus" NOT NULL,
    "billingCycle" public."BillingCycle" DEFAULT 'MONTHLY'::public."BillingCycle" NOT NULL,
    "isCurrent" boolean DEFAULT true NOT NULL,
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone,
    "nextBillingDate" timestamp(3) without time zone,
    "canceledAt" timestamp(3) without time zone,
    "trialEndsAt" timestamp(3) without time zone,
    gateway public."PaymentGateway" DEFAULT 'EFI'::public."PaymentGateway" NOT NULL,
    "gatewayCustomerId" text,
    "gatewaySubId" text,
    "pixAuthorizationId" text,
    "paymentMethod" public."PaymentMethod" DEFAULT 'PIX_AUTO'::public."PaymentMethod" NOT NULL,
    "lastPaymentDate" timestamp(3) without time zone,
    "currentPriceCents" integer NOT NULL,
    "discountCents" integer DEFAULT 0 NOT NULL,
    "gracePeriodEndsAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: totp_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.totp_devices (
    id text NOT NULL,
    "userId" text NOT NULL,
    secret text NOT NULL,
    name text NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: usage_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_records (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    period text NOT NULL,
    "messagesUsed" integer DEFAULT 0 NOT NULL,
    "storageUsedMb" integer DEFAULT 0 NOT NULL,
    "aiCreditsUsed" integer DEFAULT 0 NOT NULL,
    "contactsCount" integer DEFAULT 0 NOT NULL,
    "apiCallsCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: verified_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verified_domains (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    domain text NOT NULL,
    "verificationMethod" text NOT NULL,
    "verificationToken" text NOT NULL,
    "verifiedAt" timestamp(3) without time zone,
    "defaultRoleId" text,
    "autoJoin" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id text NOT NULL,
    "gatewayEventId" text NOT NULL,
    gateway public."PaymentGateway" NOT NULL,
    "eventType" text NOT NULL,
    status public."WebhookEventStatus" DEFAULT 'RECEIVED'::public."WebhookEventStatus" NOT NULL,
    payload jsonb NOT NULL,
    "processedAt" timestamp(3) without time zone,
    "errorMessage" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: invoices number; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices ALTER COLUMN number SET DEFAULT nextval('public.invoices_number_seq'::regclass);


--
-- Name: AIAgentConfig AIAgentConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAgentConfig"
    ADD CONSTRAINT "AIAgentConfig_pkey" PRIMARY KEY (id);


--
-- Name: AIPrompt AIPrompt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIPrompt"
    ADD CONSTRAINT "AIPrompt_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: ChatSession ChatSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatSession"
    ADD CONSTRAINT "ChatSession_pkey" PRIMARY KEY (id);


--
-- Name: Department Department_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Department"
    ADD CONSTRAINT "Department_pkey" PRIMARY KEY (id);


--
-- Name: DeviceSession DeviceSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DeviceSession"
    ADD CONSTRAINT "DeviceSession_pkey" PRIMARY KEY (id);


--
-- Name: EmailTemplate EmailTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailTemplate"
    ADD CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY (id);


--
-- Name: File File_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."File"
    ADD CONSTRAINT "File_pkey" PRIMARY KEY (id);


--
-- Name: IntegrationConfig IntegrationConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IntegrationConfig"
    ADD CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY (id);


--
-- Name: Invitation Invitation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_pkey" PRIMARY KEY (id);


--
-- Name: Message Message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_pkey" PRIMARY KEY (id);


--
-- Name: Organization Organization_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Organization"
    ADD CONSTRAINT "Organization_pkey" PRIMARY KEY (id);


--
-- Name: PasskeyChallenge PasskeyChallenge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PasskeyChallenge"
    ADD CONSTRAINT "PasskeyChallenge_pkey" PRIMARY KEY (id);


--
-- Name: PasskeyCredential PasskeyCredential_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PasskeyCredential"
    ADD CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY (id);


--
-- Name: Project Project_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Project"
    ADD CONSTRAINT "Project_pkey" PRIMARY KEY (id);


--
-- Name: RefreshToken RefreshToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "RefreshToken_pkey" PRIMARY KEY (id);


--
-- Name: Session Session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);


--
-- Name: SystemSettings SystemSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SystemSettings"
    ADD CONSTRAINT "SystemSettings_pkey" PRIMARY KEY (id);


--
-- Name: TempUser TempUser_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TempUser"
    ADD CONSTRAINT "TempUser_pkey" PRIMARY KEY (id);


--
-- Name: UserOrganization UserOrganization_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserOrganization"
    ADD CONSTRAINT "UserOrganization_pkey" PRIMARY KEY (id);


--
-- Name: UserPreferences UserPreferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserPreferences"
    ADD CONSTRAINT "UserPreferences_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: VerificationCode VerificationCode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VerificationCode"
    ADD CONSTRAINT "VerificationCode_pkey" PRIMARY KEY (id);


--
-- Name: WebhookDelivery WebhookDelivery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookDelivery"
    ADD CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY (id);


--
-- Name: Webhook Webhook_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Webhook"
    ADD CONSTRAINT "Webhook_pkey" PRIMARY KEY (id);


--
-- Name: agent_deployments agent_deployments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_deployments
    ADD CONSTRAINT agent_deployments_pkey PRIMARY KEY (id);


--
-- Name: agent_prompt_versions agent_prompt_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_versions
    ADD CONSTRAINT agent_prompt_versions_pkey PRIMARY KEY (id);


--
-- Name: agent_tools agent_tools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tools
    ADD CONSTRAINT agent_tools_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: builder_context_snapshots builder_context_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_context_snapshots
    ADD CONSTRAINT builder_context_snapshots_pkey PRIMARY KEY (id);


--
-- Name: builder_deployments builder_deployments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_deployments
    ADD CONSTRAINT builder_deployments_pkey PRIMARY KEY (id);


--
-- Name: builder_project_conversations builder_project_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_project_conversations
    ADD CONSTRAINT builder_project_conversations_pkey PRIMARY KEY (id);


--
-- Name: builder_project_messages builder_project_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_project_messages
    ADD CONSTRAINT builder_project_messages_pkey PRIMARY KEY (id);


--
-- Name: builder_projects builder_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_projects
    ADD CONSTRAINT builder_projects_pkey PRIMARY KEY (id);


--
-- Name: builder_prompt_versions builder_prompt_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_prompt_versions
    ADD CONSTRAINT builder_prompt_versions_pkey PRIMARY KEY (id);


--
-- Name: builder_tool_calls builder_tool_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_tool_calls
    ADD CONSTRAINT builder_tool_calls_pkey PRIMARY KEY (id);


--
-- Name: campaign_recipients campaign_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: connection_events connection_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_events
    ADD CONSTRAINT connection_events_pkey PRIMARY KEY (id);


--
-- Name: connection_settings connection_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_settings
    ADD CONSTRAINT connection_settings_pkey PRIMARY KEY (id);


--
-- Name: connections connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_pkey PRIMARY KEY (id);


--
-- Name: custom_roles custom_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_roles
    ADD CONSTRAINT custom_roles_pkey PRIMARY KEY (id);


--
-- Name: device_auth_requests device_auth_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_auth_requests
    ADD CONSTRAINT device_auth_requests_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: log_analyses log_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_analyses
    ADD CONSTRAINT log_analyses_pkey PRIMARY KEY (id);


--
-- Name: log_entries log_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_entries
    ADD CONSTRAINT log_entries_pkey PRIMARY KEY (id);


--
-- Name: message_templates message_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);


--
-- Name: n8n_call_logs n8n_call_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_call_logs
    ADD CONSTRAINT n8n_call_logs_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY ("userId");


--
-- Name: notification_reads notification_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: organization_providers organization_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_providers
    ADD CONSTRAINT organization_providers_pkey PRIMARY KEY (id);


--
-- Name: permission_resources permission_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_resources
    ADD CONSTRAINT permission_resources_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: recovery_codes recovery_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_codes
    ADD CONSTRAINT recovery_codes_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: short_link_clicks short_link_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.short_link_clicks
    ADD CONSTRAINT short_link_clicks_pkey PRIMARY KEY (id);


--
-- Name: short_links short_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.short_links
    ADD CONSTRAINT short_links_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: totp_devices totp_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.totp_devices
    ADD CONSTRAINT totp_devices_pkey PRIMARY KEY (id);


--
-- Name: usage_records usage_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_records
    ADD CONSTRAINT usage_records_pkey PRIMARY KEY (id);


--
-- Name: verified_domains verified_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verified_domains
    ADD CONSTRAINT verified_domains_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: AIAgentConfig_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AIAgentConfig_isActive_idx" ON public."AIAgentConfig" USING btree ("isActive");


--
-- Name: AIAgentConfig_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AIAgentConfig_organizationId_idx" ON public."AIAgentConfig" USING btree ("organizationId");


--
-- Name: AIAgentConfig_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AIAgentConfig_organizationId_name_key" ON public."AIAgentConfig" USING btree ("organizationId", name);


--
-- Name: AIPrompt_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AIPrompt_name_idx" ON public."AIPrompt" USING btree (name);


--
-- Name: AIPrompt_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AIPrompt_name_key" ON public."AIPrompt" USING btree (name);


--
-- Name: AuditLog_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_action_idx" ON public."AuditLog" USING btree (action);


--
-- Name: AuditLog_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_createdAt_idx" ON public."AuditLog" USING btree ("createdAt");


--
-- Name: AuditLog_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_organizationId_idx" ON public."AuditLog" USING btree ("organizationId");


--
-- Name: AuditLog_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_resource_idx" ON public."AuditLog" USING btree (resource);


--
-- Name: AuditLog_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_userId_idx" ON public."AuditLog" USING btree ("userId");


--
-- Name: ChatSession_aiAgentConfigId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_aiAgentConfigId_idx" ON public."ChatSession" USING btree ("aiAgentConfigId");


--
-- Name: ChatSession_aiBlockedUntil_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_aiBlockedUntil_idx" ON public."ChatSession" USING btree ("aiBlockedUntil");


--
-- Name: ChatSession_assignedAgentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_assignedAgentId_idx" ON public."ChatSession" USING btree ("assignedAgentId");


--
-- Name: ChatSession_assignedDepartmentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_assignedDepartmentId_idx" ON public."ChatSession" USING btree ("assignedDepartmentId");


--
-- Name: ChatSession_connectionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_connectionId_idx" ON public."ChatSession" USING btree ("connectionId");


--
-- Name: ChatSession_contactPhone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_contactPhone_idx" ON public."ChatSession" USING btree ("contactPhone");


--
-- Name: ChatSession_customerJourney_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_customerJourney_idx" ON public."ChatSession" USING btree ("customerJourney");


--
-- Name: ChatSession_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_expiresAt_idx" ON public."ChatSession" USING btree ("expiresAt");


--
-- Name: ChatSession_externalId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_externalId_idx" ON public."ChatSession" USING btree ("externalId");


--
-- Name: ChatSession_lastMessageAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_lastMessageAt_idx" ON public."ChatSession" USING btree ("lastMessageAt");


--
-- Name: ChatSession_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_organizationId_idx" ON public."ChatSession" USING btree ("organizationId");


--
-- Name: ChatSession_pausedUntil_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_pausedUntil_idx" ON public."ChatSession" USING btree ("pausedUntil");


--
-- Name: ChatSession_pinnedAgentVersion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_pinnedAgentVersion_idx" ON public."ChatSession" USING btree ("pinnedAgentVersion");


--
-- Name: ChatSession_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_status_idx" ON public."ChatSession" USING btree (status);


--
-- Name: ChatSession_whatsappWindowExpiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_whatsappWindowExpiresAt_idx" ON public."ChatSession" USING btree ("whatsappWindowExpiresAt");


--
-- Name: Department_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Department_isActive_idx" ON public."Department" USING btree ("isActive");


--
-- Name: Department_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Department_organizationId_idx" ON public."Department" USING btree ("organizationId");


--
-- Name: Department_organizationId_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Department_organizationId_slug_key" ON public."Department" USING btree ("organizationId", slug);


--
-- Name: Department_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Department_slug_idx" ON public."Department" USING btree (slug);


--
-- Name: Department_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Department_type_idx" ON public."Department" USING btree (type);


--
-- Name: DeviceSession_isRevoked_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DeviceSession_isRevoked_idx" ON public."DeviceSession" USING btree ("isRevoked");


--
-- Name: DeviceSession_lastActiveAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DeviceSession_lastActiveAt_idx" ON public."DeviceSession" USING btree ("lastActiveAt");


--
-- Name: DeviceSession_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DeviceSession_userId_idx" ON public."DeviceSession" USING btree ("userId");


--
-- Name: EmailTemplate_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmailTemplate_name_idx" ON public."EmailTemplate" USING btree (name);


--
-- Name: EmailTemplate_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EmailTemplate_name_key" ON public."EmailTemplate" USING btree (name);


--
-- Name: File_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "File_createdAt_idx" ON public."File" USING btree ("createdAt");


--
-- Name: File_mimeType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "File_mimeType_idx" ON public."File" USING btree ("mimeType");


--
-- Name: File_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "File_organizationId_idx" ON public."File" USING btree ("organizationId");


--
-- Name: File_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "File_userId_idx" ON public."File" USING btree ("userId");


--
-- Name: IntegrationConfig_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IntegrationConfig_isActive_idx" ON public."IntegrationConfig" USING btree ("isActive");


--
-- Name: IntegrationConfig_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IntegrationConfig_organizationId_idx" ON public."IntegrationConfig" USING btree ("organizationId");


--
-- Name: IntegrationConfig_organizationId_type_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IntegrationConfig_organizationId_type_name_key" ON public."IntegrationConfig" USING btree ("organizationId", type, name);


--
-- Name: IntegrationConfig_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IntegrationConfig_type_idx" ON public."IntegrationConfig" USING btree (type);


--
-- Name: Invitation_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invitation_expiresAt_idx" ON public."Invitation" USING btree ("expiresAt");


--
-- Name: Invitation_invitedById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invitation_invitedById_idx" ON public."Invitation" USING btree ("invitedById");


--
-- Name: Invitation_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invitation_organizationId_idx" ON public."Invitation" USING btree ("organizationId");


--
-- Name: Invitation_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invitation_token_idx" ON public."Invitation" USING btree (token);


--
-- Name: Invitation_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invitation_token_key" ON public."Invitation" USING btree (token);


--
-- Name: Message_aiAgentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Message_aiAgentId_idx" ON public."Message" USING btree ("aiAgentId");


--
-- Name: Message_aiModel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Message_aiModel_idx" ON public."Message" USING btree ("aiModel");


--
-- Name: Message_concatGroupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Message_concatGroupId_idx" ON public."Message" USING btree ("concatGroupId");


--
-- Name: Message_connectionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Message_connectionId_idx" ON public."Message" USING btree ("connectionId");


--
-- Name: Message_contactPhone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Message_contactPhone_idx" ON public."Message" USING btree ("contactPhone");


--
-- Name: Message_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Message_createdAt_idx" ON public."Message" USING btree ("createdAt");


--
-- Name: Message_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Message_sessionId_idx" ON public."Message" USING btree ("sessionId");


--
-- Name: Message_transcriptionStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Message_transcriptionStatus_idx" ON public."Message" USING btree ("transcriptionStatus");


--
-- Name: Message_waMessageId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Message_waMessageId_idx" ON public."Message" USING btree ("waMessageId");


--
-- Name: Message_waMessageId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Message_waMessageId_key" ON public."Message" USING btree ("waMessageId");


--
-- Name: Organization_billingType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Organization_billingType_idx" ON public."Organization" USING btree ("billingType");


--
-- Name: Organization_document_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Organization_document_idx" ON public."Organization" USING btree (document);


--
-- Name: Organization_document_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Organization_document_key" ON public."Organization" USING btree (document);


--
-- Name: Organization_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Organization_slug_idx" ON public."Organization" USING btree (slug);


--
-- Name: Organization_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Organization_slug_key" ON public."Organization" USING btree (slug);


--
-- Name: PasskeyChallenge_challenge_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PasskeyChallenge_challenge_idx" ON public."PasskeyChallenge" USING btree (challenge);


--
-- Name: PasskeyChallenge_challenge_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PasskeyChallenge_challenge_key" ON public."PasskeyChallenge" USING btree (challenge);


--
-- Name: PasskeyChallenge_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PasskeyChallenge_email_idx" ON public."PasskeyChallenge" USING btree (email);


--
-- Name: PasskeyChallenge_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PasskeyChallenge_expiresAt_idx" ON public."PasskeyChallenge" USING btree ("expiresAt");


--
-- Name: PasskeyChallenge_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PasskeyChallenge_userId_idx" ON public."PasskeyChallenge" USING btree ("userId");


--
-- Name: PasskeyCredential_credentialId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PasskeyCredential_credentialId_idx" ON public."PasskeyCredential" USING btree ("credentialId");


--
-- Name: PasskeyCredential_credentialId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PasskeyCredential_credentialId_key" ON public."PasskeyCredential" USING btree ("credentialId");


--
-- Name: PasskeyCredential_lastUsedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PasskeyCredential_lastUsedAt_idx" ON public."PasskeyCredential" USING btree ("lastUsedAt");


--
-- Name: PasskeyCredential_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PasskeyCredential_userId_idx" ON public."PasskeyCredential" USING btree ("userId");


--
-- Name: Project_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Project_organizationId_idx" ON public."Project" USING btree ("organizationId");


--
-- Name: RefreshToken_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RefreshToken_expiresAt_idx" ON public."RefreshToken" USING btree ("expiresAt");


--
-- Name: RefreshToken_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RefreshToken_token_idx" ON public."RefreshToken" USING btree (token);


--
-- Name: RefreshToken_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "RefreshToken_token_key" ON public."RefreshToken" USING btree (token);


--
-- Name: RefreshToken_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RefreshToken_userId_idx" ON public."RefreshToken" USING btree ("userId");


--
-- Name: Session_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_expiresAt_idx" ON public."Session" USING btree ("expiresAt");


--
-- Name: Session_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_token_idx" ON public."Session" USING btree (token);


--
-- Name: Session_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Session_token_key" ON public."Session" USING btree (token);


--
-- Name: Session_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_userId_idx" ON public."Session" USING btree ("userId");


--
-- Name: SystemSettings_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SystemSettings_category_idx" ON public."SystemSettings" USING btree (category);


--
-- Name: SystemSettings_category_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SystemSettings_category_key_key" ON public."SystemSettings" USING btree (category, key);


--
-- Name: TempUser_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TempUser_code_idx" ON public."TempUser" USING btree (code);


--
-- Name: TempUser_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TempUser_email_idx" ON public."TempUser" USING btree (email);


--
-- Name: TempUser_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TempUser_email_key" ON public."TempUser" USING btree (email);


--
-- Name: TempUser_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TempUser_expiresAt_idx" ON public."TempUser" USING btree ("expiresAt");


--
-- Name: UserOrganization_customRoleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserOrganization_customRoleId_idx" ON public."UserOrganization" USING btree ("customRoleId");


--
-- Name: UserOrganization_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserOrganization_organizationId_idx" ON public."UserOrganization" USING btree ("organizationId");


--
-- Name: UserOrganization_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserOrganization_role_idx" ON public."UserOrganization" USING btree (role);


--
-- Name: UserOrganization_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserOrganization_userId_idx" ON public."UserOrganization" USING btree ("userId");


--
-- Name: UserOrganization_userId_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UserOrganization_userId_organizationId_key" ON public."UserOrganization" USING btree ("userId", "organizationId");


--
-- Name: UserPreferences_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UserPreferences_userId_key" ON public."UserPreferences" USING btree ("userId");


--
-- Name: User_currentOrgId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_currentOrgId_idx" ON public."User" USING btree ("currentOrgId");


--
-- Name: User_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_email_idx" ON public."User" USING btree (email);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_phone_idx" ON public."User" USING btree (phone);


--
-- Name: User_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_role_idx" ON public."User" USING btree (role);


--
-- Name: VerificationCode_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "VerificationCode_code_idx" ON public."VerificationCode" USING btree (code);


--
-- Name: VerificationCode_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "VerificationCode_expiresAt_idx" ON public."VerificationCode" USING btree ("expiresAt");


--
-- Name: VerificationCode_identifier_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "VerificationCode_identifier_type_idx" ON public."VerificationCode" USING btree (identifier, type);


--
-- Name: VerificationCode_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "VerificationCode_token_idx" ON public."VerificationCode" USING btree (token);


--
-- Name: WebhookDelivery_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookDelivery_createdAt_idx" ON public."WebhookDelivery" USING btree ("createdAt");


--
-- Name: WebhookDelivery_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookDelivery_status_idx" ON public."WebhookDelivery" USING btree (status);


--
-- Name: WebhookDelivery_webhookId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookDelivery_webhookId_idx" ON public."WebhookDelivery" USING btree ("webhookId");


--
-- Name: Webhook_connectionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Webhook_connectionId_idx" ON public."Webhook" USING btree ("connectionId");


--
-- Name: Webhook_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Webhook_isActive_idx" ON public."Webhook" USING btree ("isActive");


--
-- Name: Webhook_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Webhook_organizationId_idx" ON public."Webhook" USING btree ("organizationId");


--
-- Name: agent_deployments_agentConfigId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_deployments_agentConfigId_idx" ON public.agent_deployments USING btree ("agentConfigId");


--
-- Name: agent_deployments_connectionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_deployments_connectionId_idx" ON public.agent_deployments USING btree ("connectionId");


--
-- Name: agent_deployments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_deployments_status_idx ON public.agent_deployments USING btree (status);


--
-- Name: agent_prompt_versions_agentConfigId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_prompt_versions_agentConfigId_idx" ON public.agent_prompt_versions USING btree ("agentConfigId");


--
-- Name: agent_prompt_versions_agentConfigId_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "agent_prompt_versions_agentConfigId_version_key" ON public.agent_prompt_versions USING btree ("agentConfigId", version);


--
-- Name: agent_prompt_versions_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_prompt_versions_isActive_idx" ON public.agent_prompt_versions USING btree ("isActive");


--
-- Name: agent_tools_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_tools_organizationId_idx" ON public.agent_tools USING btree ("organizationId");


--
-- Name: agent_tools_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "agent_tools_organizationId_name_key" ON public.agent_tools USING btree ("organizationId", name);


--
-- Name: agent_tools_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_tools_type_idx ON public.agent_tools USING btree (type);


--
-- Name: api_keys_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "api_keys_expiresAt_idx" ON public.api_keys USING btree ("expiresAt");


--
-- Name: api_keys_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "api_keys_isActive_idx" ON public.api_keys USING btree ("isActive");


--
-- Name: api_keys_keyHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "api_keys_keyHash_key" ON public.api_keys USING btree ("keyHash");


--
-- Name: api_keys_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "api_keys_organizationId_idx" ON public.api_keys USING btree ("organizationId");


--
-- Name: api_keys_prefix_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_keys_prefix_idx ON public.api_keys USING btree (prefix);


--
-- Name: api_keys_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "api_keys_userId_idx" ON public.api_keys USING btree ("userId");


--
-- Name: builder_context_snapshots_conversationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "builder_context_snapshots_conversationId_createdAt_idx" ON public.builder_context_snapshots USING btree ("conversationId", "createdAt");


--
-- Name: builder_deployments_aiAgentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "builder_deployments_aiAgentId_idx" ON public.builder_deployments USING btree ("aiAgentId");


--
-- Name: builder_deployments_projectId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "builder_deployments_projectId_status_idx" ON public.builder_deployments USING btree ("projectId", status);


--
-- Name: builder_deployments_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "builder_deployments_startedAt_idx" ON public.builder_deployments USING btree ("startedAt");


--
-- Name: builder_project_conversations_organizationId_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "builder_project_conversations_organizationId_userId_idx" ON public.builder_project_conversations USING btree ("organizationId", "userId");


--
-- Name: builder_project_conversations_projectId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "builder_project_conversations_projectId_key" ON public.builder_project_conversations USING btree ("projectId");


--
-- Name: builder_project_messages_conversationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "builder_project_messages_conversationId_createdAt_idx" ON public.builder_project_messages USING btree ("conversationId", "createdAt");


--
-- Name: builder_projects_aiAgentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "builder_projects_aiAgentId_key" ON public.builder_projects USING btree ("aiAgentId");


--
-- Name: builder_projects_archivedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "builder_projects_archivedAt_idx" ON public.builder_projects USING btree ("archivedAt");


--
-- Name: builder_projects_organizationId_type_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "builder_projects_organizationId_type_status_idx" ON public.builder_projects USING btree ("organizationId", type, status);


--
-- Name: builder_projects_userId_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "builder_projects_userId_updatedAt_idx" ON public.builder_projects USING btree ("userId", "updatedAt" DESC);


--
-- Name: builder_prompt_versions_aiAgentId_publishedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "builder_prompt_versions_aiAgentId_publishedAt_idx" ON public.builder_prompt_versions USING btree ("aiAgentId", "publishedAt");


--
-- Name: builder_prompt_versions_aiAgentId_versionNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "builder_prompt_versions_aiAgentId_versionNumber_key" ON public.builder_prompt_versions USING btree ("aiAgentId", "versionNumber");


--
-- Name: builder_tool_calls_messageId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "builder_tool_calls_messageId_idx" ON public.builder_tool_calls USING btree ("messageId");


--
-- Name: builder_tool_calls_status_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "builder_tool_calls_status_createdAt_idx" ON public.builder_tool_calls USING btree (status, "createdAt");


--
-- Name: builder_tool_calls_toolName_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "builder_tool_calls_toolName_createdAt_idx" ON public.builder_tool_calls USING btree ("toolName", "createdAt");


--
-- Name: campaign_recipients_campaignId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "campaign_recipients_campaignId_idx" ON public.campaign_recipients USING btree ("campaignId");


--
-- Name: campaign_recipients_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_recipients_status_idx ON public.campaign_recipients USING btree (status);


--
-- Name: campaigns_connectionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "campaigns_connectionId_idx" ON public.campaigns USING btree ("connectionId");


--
-- Name: campaigns_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "campaigns_organizationId_idx" ON public.campaigns USING btree ("organizationId");


--
-- Name: campaigns_scheduledAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "campaigns_scheduledAt_idx" ON public.campaigns USING btree ("scheduledAt");


--
-- Name: campaigns_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_status_idx ON public.campaigns USING btree (status);


--
-- Name: connection_events_connectionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "connection_events_connectionId_idx" ON public.connection_events USING btree ("connectionId");


--
-- Name: connection_events_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "connection_events_createdAt_idx" ON public.connection_events USING btree ("createdAt");


--
-- Name: connection_events_eventType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "connection_events_eventType_idx" ON public.connection_events USING btree ("eventType");


--
-- Name: connection_settings_connectionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "connection_settings_connectionId_idx" ON public.connection_settings USING btree ("connectionId");


--
-- Name: connection_settings_connectionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "connection_settings_connectionId_key" ON public.connection_settings USING btree ("connectionId");


--
-- Name: connections_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connections_channel_idx ON public.connections USING btree (channel);


--
-- Name: connections_cloud_api_phone_number_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connections_cloud_api_phone_number_id_idx ON public.connections USING btree (cloud_api_phone_number_id);


--
-- Name: connections_n8nWorkflowId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "connections_n8nWorkflowId_idx" ON public.connections USING btree ("n8nWorkflowId");


--
-- Name: connections_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "connections_organizationId_idx" ON public.connections USING btree ("organizationId");


--
-- Name: connections_projectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "connections_projectId_idx" ON public.connections USING btree ("projectId");


--
-- Name: connections_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connections_provider_idx ON public.connections USING btree (provider);


--
-- Name: connections_shareToken_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "connections_shareToken_idx" ON public.connections USING btree ("shareToken");


--
-- Name: connections_shareToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "connections_shareToken_key" ON public.connections USING btree ("shareToken");


--
-- Name: connections_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connections_status_idx ON public.connections USING btree (status);


--
-- Name: connections_uazapiInstanceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "connections_uazapiInstanceId_idx" ON public.connections USING btree ("uazapiInstanceId");


--
-- Name: connections_uazapiInstanceId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "connections_uazapiInstanceId_key" ON public.connections USING btree ("uazapiInstanceId");


--
-- Name: custom_roles_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "custom_roles_organizationId_idx" ON public.custom_roles USING btree ("organizationId");


--
-- Name: custom_roles_organizationId_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "custom_roles_organizationId_slug_key" ON public.custom_roles USING btree ("organizationId", slug);


--
-- Name: device_auth_requests_deviceCode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "device_auth_requests_deviceCode_idx" ON public.device_auth_requests USING btree ("deviceCode");


--
-- Name: device_auth_requests_deviceCode_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "device_auth_requests_deviceCode_key" ON public.device_auth_requests USING btree ("deviceCode");


--
-- Name: device_auth_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_auth_requests_status_idx ON public.device_auth_requests USING btree (status);


--
-- Name: device_auth_requests_userCode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "device_auth_requests_userCode_idx" ON public.device_auth_requests USING btree ("userCode");


--
-- Name: device_auth_requests_userCode_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "device_auth_requests_userCode_key" ON public.device_auth_requests USING btree ("userCode");


--
-- Name: invoices_dueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invoices_dueDate_idx" ON public.invoices USING btree ("dueDate");


--
-- Name: invoices_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invoices_organizationId_idx" ON public.invoices USING btree ("organizationId");


--
-- Name: invoices_organizationId_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "invoices_organizationId_number_key" ON public.invoices USING btree ("organizationId", number);


--
-- Name: invoices_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_status_idx ON public.invoices USING btree (status);


--
-- Name: invoices_subscriptionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invoices_subscriptionId_idx" ON public.invoices USING btree ("subscriptionId");


--
-- Name: log_analyses_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "log_analyses_createdAt_idx" ON public.log_analyses USING btree ("createdAt");


--
-- Name: log_analyses_periodStart_periodEnd_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "log_analyses_periodStart_periodEnd_idx" ON public.log_analyses USING btree ("periodStart", "periodEnd");


--
-- Name: log_analyses_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX log_analyses_type_idx ON public.log_analyses USING btree (type);


--
-- Name: log_entries_aiPatternMatch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "log_entries_aiPatternMatch_idx" ON public.log_entries USING btree ("aiPatternMatch");


--
-- Name: log_entries_aiSeverity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "log_entries_aiSeverity_idx" ON public.log_entries USING btree ("aiSeverity");


--
-- Name: log_entries_connectionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "log_entries_connectionId_idx" ON public.log_entries USING btree ("connectionId");


--
-- Name: log_entries_level_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX log_entries_level_idx ON public.log_entries USING btree (level);


--
-- Name: log_entries_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "log_entries_organizationId_idx" ON public.log_entries USING btree ("organizationId");


--
-- Name: log_entries_requestId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "log_entries_requestId_idx" ON public.log_entries USING btree ("requestId");


--
-- Name: log_entries_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "log_entries_sessionId_idx" ON public.log_entries USING btree ("sessionId");


--
-- Name: log_entries_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX log_entries_source_idx ON public.log_entries USING btree (source);


--
-- Name: log_entries_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX log_entries_timestamp_idx ON public.log_entries USING btree ("timestamp");


--
-- Name: log_entries_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "log_entries_userId_idx" ON public.log_entries USING btree ("userId");


--
-- Name: message_templates_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_templates_category_idx ON public.message_templates USING btree (category);


--
-- Name: message_templates_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "message_templates_organizationId_idx" ON public.message_templates USING btree ("organizationId");


--
-- Name: message_templates_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_templates_status_idx ON public.message_templates USING btree (status);


--
-- Name: n8n_call_logs_connectionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "n8n_call_logs_connectionId_idx" ON public.n8n_call_logs USING btree ("connectionId");


--
-- Name: n8n_call_logs_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "n8n_call_logs_createdAt_idx" ON public.n8n_call_logs USING btree ("createdAt");


--
-- Name: n8n_call_logs_success_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX n8n_call_logs_success_idx ON public.n8n_call_logs USING btree (success);


--
-- Name: notification_reads_notificationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_reads_notificationId_idx" ON public.notification_reads USING btree ("notificationId");


--
-- Name: notification_reads_notificationId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "notification_reads_notificationId_userId_key" ON public.notification_reads USING btree ("notificationId", "userId");


--
-- Name: notification_reads_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_reads_userId_idx" ON public.notification_reads USING btree ("userId");


--
-- Name: notifications_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_createdAt_idx" ON public.notifications USING btree ("createdAt");


--
-- Name: notifications_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_expiresAt_idx" ON public.notifications USING btree ("expiresAt");


--
-- Name: notifications_isGlobal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_isGlobal_idx" ON public.notifications USING btree ("isGlobal");


--
-- Name: notifications_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_organizationId_idx" ON public.notifications USING btree ("organizationId");


--
-- Name: notifications_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_role_idx ON public.notifications USING btree (role);


--
-- Name: notifications_scheduledFor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_scheduledFor_idx" ON public.notifications USING btree ("scheduledFor");


--
-- Name: notifications_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_type_idx ON public.notifications USING btree (type);


--
-- Name: notifications_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_userId_idx" ON public.notifications USING btree ("userId");


--
-- Name: organization_providers_builderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "organization_providers_builderProjectId_idx" ON public.organization_providers USING btree ("builderProjectId");


--
-- Name: organization_providers_category_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_providers_category_provider_idx ON public.organization_providers USING btree (category, provider);


--
-- Name: organization_providers_organizationId_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "organization_providers_organizationId_category_idx" ON public.organization_providers USING btree ("organizationId", category);


--
-- Name: organization_providers_organizationId_category_provider_bui_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "organization_providers_organizationId_category_provider_bui_key" ON public.organization_providers USING btree ("organizationId", category, provider, "builderProjectId", priority);


--
-- Name: organization_providers_organizationId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "organization_providers_organizationId_isActive_idx" ON public.organization_providers USING btree ("organizationId", "isActive");


--
-- Name: permission_resources_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "permission_resources_isActive_idx" ON public.permission_resources USING btree ("isActive");


--
-- Name: permission_resources_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX permission_resources_resource_idx ON public.permission_resources USING btree (resource);


--
-- Name: permission_resources_resource_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permission_resources_resource_key ON public.permission_resources USING btree (resource);


--
-- Name: plans_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "plans_isActive_idx" ON public.plans USING btree ("isActive");


--
-- Name: plans_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plans_slug_idx ON public.plans USING btree (slug);


--
-- Name: plans_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plans_slug_key ON public.plans USING btree (slug);


--
-- Name: recovery_codes_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "recovery_codes_userId_idx" ON public.recovery_codes USING btree ("userId");


--
-- Name: role_permissions_resourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "role_permissions_resourceId_idx" ON public.role_permissions USING btree ("resourceId");


--
-- Name: role_permissions_resourceId_role_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "role_permissions_resourceId_role_key" ON public.role_permissions USING btree ("resourceId", role);


--
-- Name: role_permissions_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX role_permissions_role_idx ON public.role_permissions USING btree (role);


--
-- Name: short_link_clicks_clickedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "short_link_clicks_clickedAt_idx" ON public.short_link_clicks USING btree ("clickedAt");


--
-- Name: short_link_clicks_shortLinkId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "short_link_clicks_shortLinkId_idx" ON public.short_link_clicks USING btree ("shortLinkId");


--
-- Name: short_links_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "short_links_organizationId_idx" ON public.short_links USING btree ("organizationId");


--
-- Name: short_links_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX short_links_slug_idx ON public.short_links USING btree (slug);


--
-- Name: short_links_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX short_links_slug_key ON public.short_links USING btree (slug);


--
-- Name: subscriptions_isCurrent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "subscriptions_isCurrent_idx" ON public.subscriptions USING btree ("isCurrent");


--
-- Name: subscriptions_nextBillingDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "subscriptions_nextBillingDate_idx" ON public.subscriptions USING btree ("nextBillingDate");


--
-- Name: subscriptions_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "subscriptions_organizationId_idx" ON public.subscriptions USING btree ("organizationId");


--
-- Name: subscriptions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_status_idx ON public.subscriptions USING btree (status);


--
-- Name: totp_devices_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "totp_devices_userId_idx" ON public.totp_devices USING btree ("userId");


--
-- Name: usage_records_organizationId_period_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "usage_records_organizationId_period_key" ON public.usage_records USING btree ("organizationId", period);


--
-- Name: verified_domains_domain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verified_domains_domain_idx ON public.verified_domains USING btree (domain);


--
-- Name: verified_domains_organizationId_domain_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "verified_domains_organizationId_domain_key" ON public.verified_domains USING btree ("organizationId", domain);


--
-- Name: verified_domains_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "verified_domains_organizationId_idx" ON public.verified_domains USING btree ("organizationId");


--
-- Name: webhook_events_eventType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "webhook_events_eventType_idx" ON public.webhook_events USING btree ("eventType");


--
-- Name: webhook_events_gateway_gatewayEventId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "webhook_events_gateway_gatewayEventId_key" ON public.webhook_events USING btree (gateway, "gatewayEventId");


--
-- Name: webhook_events_gateway_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_gateway_idx ON public.webhook_events USING btree (gateway);


--
-- Name: webhook_events_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_status_idx ON public.webhook_events USING btree (status);


--
-- Name: AuditLog AuditLog_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AuditLog AuditLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ChatSession ChatSession_aiAgentConfigId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatSession"
    ADD CONSTRAINT "ChatSession_aiAgentConfigId_fkey" FOREIGN KEY ("aiAgentConfigId") REFERENCES public."AIAgentConfig"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ChatSession ChatSession_assignedDepartmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatSession"
    ADD CONSTRAINT "ChatSession_assignedDepartmentId_fkey" FOREIGN KEY ("assignedDepartmentId") REFERENCES public."Department"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ChatSession ChatSession_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatSession"
    ADD CONSTRAINT "ChatSession_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public.connections(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ChatSession ChatSession_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatSession"
    ADD CONSTRAINT "ChatSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DeviceSession DeviceSession_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DeviceSession"
    ADD CONSTRAINT "DeviceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: File File_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."File"
    ADD CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Invitation Invitation_invitedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Invitation Invitation_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Message Message_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public.connections(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Message Message_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."ChatSession"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PasskeyCredential PasskeyCredential_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PasskeyCredential"
    ADD CONSTRAINT "PasskeyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Project Project_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Project"
    ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: RefreshToken RefreshToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Session Session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserOrganization UserOrganization_customRoleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserOrganization"
    ADD CONSTRAINT "UserOrganization_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES public.custom_roles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UserOrganization UserOrganization_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserOrganization"
    ADD CONSTRAINT "UserOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserOrganization UserOrganization_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserOrganization"
    ADD CONSTRAINT "UserOrganization_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserPreferences UserPreferences_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserPreferences"
    ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: VerificationCode VerificationCode_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VerificationCode"
    ADD CONSTRAINT "VerificationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WebhookDelivery WebhookDelivery_webhookId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookDelivery"
    ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES public."Webhook"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Webhook Webhook_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Webhook"
    ADD CONSTRAINT "Webhook_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public.connections(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Webhook Webhook_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Webhook"
    ADD CONSTRAINT "Webhook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_deployments agent_deployments_agentConfigId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_deployments
    ADD CONSTRAINT "agent_deployments_agentConfigId_fkey" FOREIGN KEY ("agentConfigId") REFERENCES public."AIAgentConfig"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_deployments agent_deployments_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_deployments
    ADD CONSTRAINT "agent_deployments_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public.connections(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_prompt_versions agent_prompt_versions_agentConfigId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_versions
    ADD CONSTRAINT "agent_prompt_versions_agentConfigId_fkey" FOREIGN KEY ("agentConfigId") REFERENCES public."AIAgentConfig"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_prompt_versions agent_prompt_versions_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_versions
    ADD CONSTRAINT "agent_prompt_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: builder_deployments builder_deployments_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_deployments
    ADD CONSTRAINT "builder_deployments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public.builder_projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: builder_project_conversations builder_project_conversations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_project_conversations
    ADD CONSTRAINT "builder_project_conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: builder_project_conversations builder_project_conversations_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_project_conversations
    ADD CONSTRAINT "builder_project_conversations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public.builder_projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: builder_project_conversations builder_project_conversations_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_project_conversations
    ADD CONSTRAINT "builder_project_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: builder_project_messages builder_project_messages_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_project_messages
    ADD CONSTRAINT "builder_project_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public.builder_project_conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: builder_projects builder_projects_aiAgentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_projects
    ADD CONSTRAINT "builder_projects_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES public."AIAgentConfig"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: builder_projects builder_projects_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_projects
    ADD CONSTRAINT "builder_projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: builder_projects builder_projects_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_projects
    ADD CONSTRAINT "builder_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: builder_prompt_versions builder_prompt_versions_aiAgentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_prompt_versions
    ADD CONSTRAINT "builder_prompt_versions_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES public."AIAgentConfig"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: builder_prompt_versions builder_prompt_versions_publishedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.builder_prompt_versions
    ADD CONSTRAINT "builder_prompt_versions_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: campaign_recipients campaign_recipients_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: connection_events connection_events_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_events
    ADD CONSTRAINT "connection_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public.connections(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: connection_settings connection_settings_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_settings
    ADD CONSTRAINT "connection_settings_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public.connections(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: connections connections_assignedCustomerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT "connections_assignedCustomerId_fkey" FOREIGN KEY ("assignedCustomerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: connections connections_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT "connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: connections connections_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT "connections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public."Project"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: custom_roles custom_roles_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_roles
    ADD CONSTRAINT "custom_roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: invoices invoices_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: invoices invoices_subscriptionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES public.subscriptions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: n8n_call_logs n8n_call_logs_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_call_logs
    ADD CONSTRAINT "n8n_call_logs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public.connections(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notification_reads notification_reads_notificationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT "notification_reads_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES public.notifications(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_providers organization_providers_builderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_providers
    ADD CONSTRAINT "organization_providers_builderProjectId_fkey" FOREIGN KEY ("builderProjectId") REFERENCES public.builder_projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_providers organization_providers_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_providers
    ADD CONSTRAINT "organization_providers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: recovery_codes recovery_codes_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_codes
    ADD CONSTRAINT "recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_resourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "role_permissions_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES public.permission_resources(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: short_link_clicks short_link_clicks_shortLinkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.short_link_clicks
    ADD CONSTRAINT "short_link_clicks_shortLinkId_fkey" FOREIGN KEY ("shortLinkId") REFERENCES public.short_links(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: totp_devices totp_devices_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.totp_devices
    ADD CONSTRAINT "totp_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: usage_records usage_records_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_records
    ADD CONSTRAINT "usage_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: verified_domains verified_domains_defaultRoleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verified_domains
    ADD CONSTRAINT "verified_domains_defaultRoleId_fkey" FOREIGN KEY ("defaultRoleId") REFERENCES public.custom_roles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: verified_domains verified_domains_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verified_domains
    ADD CONSTRAINT "verified_domains_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


