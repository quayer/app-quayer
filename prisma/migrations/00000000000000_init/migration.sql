-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'TELEGRAM', 'EMAIL');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('WHATSAPP_WEB', 'WHATSAPP_CLOUD_API', 'WHATSAPP_BUSINESS_API', 'INSTAGRAM_META', 'TELEGRAM_BOT', 'EMAIL_SMTP');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTED', 'CONNECTING', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "ConnectionEventType" AS ENUM ('CONNECTED', 'DISCONNECTED', 'CONNECTION_LOST', 'QR_GENERATED', 'QR_SCANNED', 'QR_TIMEOUT', 'QR_RETRY', 'ERROR', 'RECONNECTING');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('QUEUED', 'ACTIVE', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SessionStartedBy" AS ENUM ('CUSTOMER', 'BUSINESS', 'AGENT');

-- CreateEnum
CREATE TYPE "AutoPauseBehavior" AS ENUM ('CLOSE_SESSION', 'WAIT_CUSTOMER');

-- CreateEnum
CREATE TYPE "GroupMode" AS ENUM ('DISABLED', 'MONITOR_ONLY', 'ACTIVE');

-- CreateEnum
CREATE TYPE "GroupAIResponseMode" AS ENUM ('IN_GROUP', 'PRIVATE', 'HYBRID');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'video', 'audio', 'voice', 'document', 'location', 'contact', 'sticker', 'poll', 'list', 'buttons');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "TranscriptionStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('CUSTOMER', 'AGENT', 'AI', 'BUSINESS', 'SYSTEM', 'AGENT_PLATFORM');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INCOMING', 'OUTGOING');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('INITIATED', 'RINGING', 'ANSWERED', 'MISSED', 'REJECTED', 'BUSY', 'FAILED', 'ENDED');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('OPENAI', 'ANTHROPIC', 'GROQ', 'TOGETHER_AI', 'OLLAMA', 'DEEPGRAM', 'WHISPER_API', 'ASSEMBLY_AI', 'SUPABASE', 'AWS_S3', 'CLOUDFLARE_R2', 'POSTGRESQL', 'REDIS', 'MONGODB', 'UAZAPI', 'CHATWOOT', 'WHATSAPP_CLOUD', 'TELEGRAM', 'MESSENGER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ProviderCategory" AS ENUM ('AI', 'TRANSCRIPTION', 'TTS', 'INFRASTRUCTURE', 'AUXILIARY');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MESSAGE', 'USER', 'WARNING', 'INFO', 'SUCCESS', 'ERROR', 'SYSTEM', 'CONNECTION');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "maxInstances" INTEGER NOT NULL DEFAULT 1,
    "maxUsers" INTEGER NOT NULL DEFAULT 1,
    "billingType" TEXT NOT NULL DEFAULT 'free',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "businessHoursStart" TEXT,
    "businessHoursEnd" TEXT,
    "businessDays" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "sessionTimeoutHours" INTEGER NOT NULL DEFAULT 24,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "balancedDistribution" BOOLEAN NOT NULL DEFAULT true,
    "typingIndicator" BOOLEAN NOT NULL DEFAULT true,
    "profanityFilter" BOOLEAN NOT NULL DEFAULT false,
    "autoGreeting" BOOLEAN NOT NULL DEFAULT false,
    "greetingMessage" TEXT,
    "autoPauseBehavior" "AutoPauseBehavior" NOT NULL DEFAULT 'WAIT_CUSTOMER',
    "autoPauseWaitMinutes" INTEGER NOT NULL DEFAULT 30,
    "autoPauseDurationMinutes" INTEGER NOT NULL DEFAULT 15,
    "groupDefaultMode" "GroupMode" NOT NULL DEFAULT 'DISABLED',
    "groupAiResponseMode" "GroupAIResponseMode" NOT NULL DEFAULT 'PRIVATE',
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#000000',
    "secondaryColor" TEXT,
    "supportEmail" TEXT,
    "customDomain" TEXT,
    "providerType" TEXT NOT NULL DEFAULT 'quayer',
    "uazapiUrl" TEXT,
    "uazapiKey" TEXT,
    "smtpConfig" JSONB,
    "useOwnOpenAI" BOOLEAN NOT NULL DEFAULT false,
    "useOwnRedis" BOOLEAN NOT NULL DEFAULT false,
    "useOwnDatabase" BOOLEAN NOT NULL DEFAULT false,
    "useOwnStorage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOrganization" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "currentOrgId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "lastOrganizationId" TEXT,
    "messageSignature" JSONB,
    "aiSuggestionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasskeyCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "credentialDeviceType" TEXT NOT NULL DEFAULT 'singleDevice',
    "credentialBackedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" TEXT[],
    "name" TEXT NOT NULL DEFAULT 'Minha Passkey',
    "aaguid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasskeyChallenge" (
    "id" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "type" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasskeyChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TempUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TempUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "token" TEXT,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "organizationId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'support',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organizationId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'WHATSAPP',
    "provider" "Provider" NOT NULL DEFAULT 'WHATSAPP_WEB',
    "status" "ConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "phoneNumber" TEXT,
    "profileName" TEXT,
    "profilePictureUrl" TEXT,
    "isBusiness" BOOLEAN NOT NULL DEFAULT false,
    "uazapiInstanceId" TEXT,
    "uazapiToken" TEXT,
    "qrCode" TEXT,
    "pairingCode" TEXT,
    "lastConnected" TIMESTAMP(3),
    "lastDisconnect" TIMESTAMP(3),
    "lastDisconnectReason" TEXT,
    "cloud_api_access_token" TEXT,
    "cloud_api_phone_number_id" TEXT,
    "cloud_api_waba_id" TEXT,
    "cloud_api_verified_name" TEXT,
    "n8nWebhookUrl" TEXT,
    "n8nWorkflowId" TEXT,
    "n8nFallbackUrl" TEXT,
    "agentConfig" JSONB,
    "organizationId" TEXT,
    "projectId" TEXT,
    "assignedCustomerId" TEXT,
    "msgDelayMin" INTEGER NOT NULL DEFAULT 2,
    "msgDelayMax" INTEGER NOT NULL DEFAULT 4,
    "shareToken" TEXT,
    "shareTokenExpiresAt" TIMESTAMP(3),
    "shareTokenExtensionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_settings" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "concatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "concatTimeoutMs" INTEGER NOT NULL DEFAULT 8000,
    "concatMaxMessages" INTEGER NOT NULL DEFAULT 10,
    "concatSameType" BOOLEAN NOT NULL DEFAULT false,
    "concatSameSender" BOOLEAN NOT NULL DEFAULT true,
    "transcriptionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "imageDescriptionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "documentAnalysisEnabled" BOOLEAN NOT NULL DEFAULT true,
    "videoTranscriptionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "geocodingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "geocodingApiKey" TEXT,
    "transcriptionModel" TEXT,
    "visionModel" TEXT,
    "analysisModel" TEXT,
    "imagePrompt" TEXT,
    "audioPrompt" TEXT,
    "documentPrompt" TEXT,
    "videoPrompt" TEXT,
    "enforceWhatsAppWindow" BOOLEAN NOT NULL DEFAULT true,
    "templateFallbackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "botEchoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "botSignature" TEXT,
    "autoPauseOnHumanReply" BOOLEAN NOT NULL DEFAULT true,
    "autoPauseDurationHours" INTEGER NOT NULL DEFAULT 24,
    "commandsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "commandPrefix" TEXT NOT NULL DEFAULT '@',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connection_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_events" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "eventType" "ConnectionEventType" NOT NULL,
    "fromStatus" "ConnectionStatus",
    "toStatus" "ConnectionStatus" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "triggeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "n8n_call_logs" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "success" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "response" JSONB,
    "error" TEXT,
    "latency" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "n8n_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "description" TEXT,
    "secret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "connectionId" TEXT,
    "organizationId" TEXT,
    "excludeMessages" BOOLEAN NOT NULL DEFAULT false,
    "addUrlEvents" BOOLEAN NOT NULL DEFAULT false,
    "addUrlTypesMessages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pathParams" JSONB,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "retryDelay" INTEGER NOT NULL DEFAULT 5000,
    "timeout" INTEGER NOT NULL DEFAULT 30000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "response" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_resources" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "actions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLevel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "organizationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "profilePicUrl" TEXT,
    "isBusiness" BOOLEAN NOT NULL DEFAULT false,
    "verifiedName" TEXT,
    "organizationId" TEXT,
    "source" TEXT,
    "externalId" TEXT,
    "bypassBots" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFields" JSONB,
    "contactField01" VARCHAR(255),
    "contactField02" VARCHAR(255),
    "contactField03" VARCHAR(255),
    "contactField04" VARCHAR(255),
    "contactField05" VARCHAR(255),
    "contactField06" VARCHAR(255),
    "contactField07" VARCHAR(255),
    "contactField08" VARCHAR(255),
    "contactField09" VARCHAR(255),
    "contactField10" VARCHAR(255),
    "contactField11" VARCHAR(255),
    "contactField12" VARCHAR(255),
    "contactField13" VARCHAR(255),
    "contactField14" VARCHAR(255),
    "contactField15" VARCHAR(255),
    "contactField16" VARCHAR(255),
    "contactField17" VARCHAR(255),
    "contactField18" VARCHAR(255),
    "contactField19" VARCHAR(255),
    "contactField20" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'QUEUED',
    "startedBy" "SessionStartedBy" NOT NULL DEFAULT 'CUSTOMER',
    "statusReason" TEXT,
    "endReason" TEXT,
    "externalId" TEXT,
    "assignedDepartmentId" TEXT,
    "assignedAgentId" TEXT,
    "assignedCustomerId" TEXT,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiBlockedUntil" TIMESTAMP(3),
    "aiBlockReason" TEXT,
    "aiAgentConfigId" TEXT,
    "aiAgentId" TEXT,
    "aiAgentName" TEXT,
    "aiAgentTarget" TEXT,
    "aiAgentBehavior" TEXT,
    "aiAgentContext" JSONB,
    "customerJourney" TEXT DEFAULT 'new',
    "journeyStage" TEXT,
    "journeyUpdatedAt" TIMESTAMP(3),
    "leadScore" INTEGER,
    "conversionProbability" DOUBLE PRECISION,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "totalAiMessages" INTEGER NOT NULL DEFAULT 0,
    "totalAgentMessages" INTEGER NOT NULL DEFAULT 0,
    "totalMediaMessages" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" INTEGER,
    "sessionDuration" INTEGER,
    "totalAiCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAuthorId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "pausedUntil" TIMESTAMP(3),
    "pausedBy" TEXT,
    "lastCustomerMessageAt" TIMESTAMP(3),
    "whatsappWindowExpiresAt" TIMESTAMP(3),
    "whatsappWindowType" TEXT DEFAULT 'CUSTOMER_INITIATED',
    "isConcat" BOOLEAN NOT NULL DEFAULT false,
    "concatTimeout" INTEGER NOT NULL DEFAULT 8,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_chats" (
    "id" TEXT NOT NULL,
    "groupJid" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "pictureUrl" TEXT,
    "ownerJid" TEXT,
    "createdAtWa" TIMESTAMP(3),
    "mode" "GroupMode" NOT NULL DEFAULT 'DISABLED',
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiResponseMode" "GroupAIResponseMode" NOT NULL DEFAULT 'PRIVATE',
    "aiAgentConfigId" TEXT,
    "sessionStatus" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "totalParticipants" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_participants" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "participantJid" TEXT NOT NULL,
    "contactId" TEXT,
    "privateSessionId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'participant',
    "lastMessageAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_messages" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "participantJid" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "type" "MessageType" NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "mimeType" TEXT,
    "fileName" TEXT,
    "isAiResponse" BOOLEAN NOT NULL DEFAULT false,
    "aiModel" TEXT,
    "aiCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_notes" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quick_replies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "shortcut" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "type" "MessageType" NOT NULL,
    "author" "MessageAuthor" NOT NULL DEFAULT 'CUSTOMER',
    "content" TEXT NOT NULL,
    "rawContent" TEXT,
    "formattedContent" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "mimeType" TEXT,
    "fileName" TEXT,
    "mediaSize" INTEGER,
    "mediaDuration" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationName" TEXT,
    "geoAddress" TEXT,
    "geoNeighborhood" TEXT,
    "geoCity" TEXT,
    "geoState" TEXT,
    "geoStateCode" TEXT,
    "geoPostalCode" TEXT,
    "geoCountry" TEXT,
    "transcription" TEXT,
    "transcriptionLanguage" TEXT,
    "transcriptionConfidence" DOUBLE PRECISION,
    "transcriptionStatus" "TranscriptionStatus" NOT NULL DEFAULT 'pending',
    "transcriptionProcessedAt" TIMESTAMP(3),
    "transcriptionError" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "isConcatenated" BOOLEAN NOT NULL DEFAULT false,
    "concatGroupId" TEXT,
    "aiModel" TEXT,
    "aiAgentId" TEXT,
    "aiAgentName" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cachedTokens" INTEGER,
    "inputCost" DOUBLE PRECISION,
    "outputCost" DOUBLE PRECISION,
    "cacheSavings" DOUBLE PRECISION,
    "totalCost" DOUBLE PRECISION,
    "aiLatency" INTEGER,
    "aiProvider" TEXT,
    "callbackSource" TEXT,
    "callbackPayload" JSONB,
    "quotedMessageId" TEXT,
    "isForwarded" BOOLEAN NOT NULL DEFAULT false,
    "forwardedInfo" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tabulation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "backgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "labelId" TEXT DEFAULT 'NaN',
    "autoTabulation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tabulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactTabulation" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tabulationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactTabulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTabulation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tabulationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionTabulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabulationIntegration" (
    "id" TEXT NOT NULL,
    "tabulationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TabulationIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabulationSetting" (
    "id" TEXT NOT NULL,
    "tabulationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TabulationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attribute" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" TEXT,
    "options" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactAttribute" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanBoard" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanColumn" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "backgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "tabulationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "backgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "icon" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactObservation" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'note',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'INITIATED',
    "externalId" TEXT,
    "initiatedBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "apiUrl" TEXT,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "settings" JSONB,
    "metadata" JSONB,
    "rateLimit" INTEGER,
    "rateLimitPeriod" INTEGER,
    "lastHealthCheck" TIMESTAMP(3),
    "healthStatus" TEXT DEFAULT 'unknown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_providers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" "ProviderCategory" NOT NULL,
    "provider" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "credentials" JSONB NOT NULL,
    "settings" JSONB,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestError" TEXT,
    "usageThisMonth" INTEGER NOT NULL DEFAULT 0,
    "costThisMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'string',
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAgentConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT NOT NULL DEFAULT 'gpt-4o',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 4096,
    "systemPrompt" TEXT,
    "personality" TEXT,
    "agentTarget" TEXT,
    "agentBehavior" TEXT,
    "agentAvatar" TEXT,
    "useMemory" BOOLEAN NOT NULL DEFAULT true,
    "memoryWindow" INTEGER NOT NULL DEFAULT 10,
    "useRAG" BOOLEAN NOT NULL DEFAULT false,
    "ragCollectionId" TEXT,
    "enabledTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enableTTS" BOOLEAN NOT NULL DEFAULT false,
    "ttsProvider" TEXT,
    "ttsVoiceId" TEXT,
    "ttsModel" TEXT,
    "ttsSpeechRate" DOUBLE PRECISION DEFAULT 1.0,
    "callbackUrl" TEXT,
    "callbackSecret" TEXT,
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCachedTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCacheSavings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCalls" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "textContent" TEXT,
    "variables" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIPrompt" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "prompt" TEXT NOT NULL,
    "model" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "AIPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['read']::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_entries" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL,
    "action" TEXT,
    "message" TEXT NOT NULL,
    "details" TEXT,
    "stackTrace" TEXT,
    "context" JSONB,
    "metadata" JSONB,
    "requestId" TEXT,
    "requestPath" TEXT,
    "requestMethod" TEXT,
    "statusCode" INTEGER,
    "duration" INTEGER,
    "userId" TEXT,
    "organizationId" TEXT,
    "connectionId" TEXT,
    "sessionId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "aiAnalysis" TEXT,
    "aiAnalyzedAt" TIMESTAMP(3),
    "aiPatternMatch" TEXT,
    "aiSeverity" INTEGER DEFAULT 0,
    "aiSuggestion" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_analyses" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "patterns" JSONB NOT NULL,
    "anomalies" JSONB NOT NULL,
    "suggestions" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 0,
    "aiModel" TEXT,
    "aiTokens" INTEGER,
    "aiCost" DOUBLE PRECISION,
    "aiLatency" INTEGER,

    CONSTRAINT "log_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "role" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "source" TEXT,
    "sourceId" TEXT,
    "metadata" JSONB,
    "scheduledFor" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_reads" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_document_key" ON "Organization"("document");

-- CreateIndex
CREATE INDEX "Organization_document_idx" ON "Organization"("document");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_billingType_idx" ON "Organization"("billingType");

-- CreateIndex
CREATE INDEX "UserOrganization_userId_idx" ON "UserOrganization"("userId");

-- CreateIndex
CREATE INDEX "UserOrganization_organizationId_idx" ON "UserOrganization"("organizationId");

-- CreateIndex
CREATE INDEX "UserOrganization_role_idx" ON "UserOrganization"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserOrganization_userId_organizationId_key" ON "UserOrganization"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_currentOrgId_idx" ON "User"("currentOrgId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_resetToken_idx" ON "User"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "PasskeyCredential_credentialId_key" ON "PasskeyCredential"("credentialId");

-- CreateIndex
CREATE INDEX "PasskeyCredential_userId_idx" ON "PasskeyCredential"("userId");

-- CreateIndex
CREATE INDEX "PasskeyCredential_credentialId_idx" ON "PasskeyCredential"("credentialId");

-- CreateIndex
CREATE INDEX "PasskeyCredential_lastUsedAt_idx" ON "PasskeyCredential"("lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasskeyChallenge_challenge_key" ON "PasskeyChallenge"("challenge");

-- CreateIndex
CREATE INDEX "PasskeyChallenge_challenge_idx" ON "PasskeyChallenge"("challenge");

-- CreateIndex
CREATE INDEX "PasskeyChallenge_userId_idx" ON "PasskeyChallenge"("userId");

-- CreateIndex
CREATE INDEX "PasskeyChallenge_email_idx" ON "PasskeyChallenge"("email");

-- CreateIndex
CREATE INDEX "PasskeyChallenge_expiresAt_idx" ON "PasskeyChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TempUser_email_key" ON "TempUser"("email");

-- CreateIndex
CREATE INDEX "TempUser_email_idx" ON "TempUser"("email");

-- CreateIndex
CREATE INDEX "TempUser_code_idx" ON "TempUser"("code");

-- CreateIndex
CREATE INDEX "TempUser_expiresAt_idx" ON "TempUser"("expiresAt");

-- CreateIndex
CREATE INDEX "VerificationCode_email_type_idx" ON "VerificationCode"("email", "type");

-- CreateIndex
CREATE INDEX "VerificationCode_code_idx" ON "VerificationCode"("code");

-- CreateIndex
CREATE INDEX "VerificationCode_token_idx" ON "VerificationCode"("token");

-- CreateIndex
CREATE INDEX "VerificationCode_expiresAt_idx" ON "VerificationCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_invitedById_idx" ON "Invitation"("invitedById");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_idx" ON "Invitation"("organizationId");

-- CreateIndex
CREATE INDEX "Invitation_token_idx" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");

-- CreateIndex
CREATE INDEX "Department_organizationId_idx" ON "Department"("organizationId");

-- CreateIndex
CREATE INDEX "Department_slug_idx" ON "Department"("slug");

-- CreateIndex
CREATE INDEX "Department_type_idx" ON "Department"("type");

-- CreateIndex
CREATE INDEX "Department_isActive_idx" ON "Department"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Department_organizationId_slug_key" ON "Department"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "connections_uazapiInstanceId_key" ON "connections"("uazapiInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "connections_shareToken_key" ON "connections"("shareToken");

-- CreateIndex
CREATE INDEX "connections_organizationId_idx" ON "connections"("organizationId");

-- CreateIndex
CREATE INDEX "connections_projectId_idx" ON "connections"("projectId");

-- CreateIndex
CREATE INDEX "connections_status_idx" ON "connections"("status");

-- CreateIndex
CREATE INDEX "connections_channel_idx" ON "connections"("channel");

-- CreateIndex
CREATE INDEX "connections_provider_idx" ON "connections"("provider");

-- CreateIndex
CREATE INDEX "connections_uazapiInstanceId_idx" ON "connections"("uazapiInstanceId");

-- CreateIndex
CREATE INDEX "connections_cloud_api_phone_number_id_idx" ON "connections"("cloud_api_phone_number_id");

-- CreateIndex
CREATE INDEX "connections_shareToken_idx" ON "connections"("shareToken");

-- CreateIndex
CREATE INDEX "connections_n8nWorkflowId_idx" ON "connections"("n8nWorkflowId");

-- CreateIndex
CREATE UNIQUE INDEX "connection_settings_connectionId_key" ON "connection_settings"("connectionId");

-- CreateIndex
CREATE INDEX "connection_settings_connectionId_idx" ON "connection_settings"("connectionId");

-- CreateIndex
CREATE INDEX "connection_events_connectionId_idx" ON "connection_events"("connectionId");

-- CreateIndex
CREATE INDEX "connection_events_eventType_idx" ON "connection_events"("eventType");

-- CreateIndex
CREATE INDEX "connection_events_createdAt_idx" ON "connection_events"("createdAt");

-- CreateIndex
CREATE INDEX "n8n_call_logs_connectionId_idx" ON "n8n_call_logs"("connectionId");

-- CreateIndex
CREATE INDEX "n8n_call_logs_success_idx" ON "n8n_call_logs"("success");

-- CreateIndex
CREATE INDEX "n8n_call_logs_createdAt_idx" ON "n8n_call_logs"("createdAt");

-- CreateIndex
CREATE INDEX "Webhook_connectionId_idx" ON "Webhook"("connectionId");

-- CreateIndex
CREATE INDEX "Webhook_organizationId_idx" ON "Webhook"("organizationId");

-- CreateIndex
CREATE INDEX "Webhook_isActive_idx" ON "Webhook"("isActive");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_idx" ON "WebhookDelivery"("status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_resource_idx" ON "AuditLog"("resource");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "permission_resources_resource_key" ON "permission_resources"("resource");

-- CreateIndex
CREATE INDEX "permission_resources_resource_idx" ON "permission_resources"("resource");

-- CreateIndex
CREATE INDEX "permission_resources_isActive_idx" ON "permission_resources"("isActive");

-- CreateIndex
CREATE INDEX "role_permissions_role_idx" ON "role_permissions"("role");

-- CreateIndex
CREATE INDEX "role_permissions_resourceId_idx" ON "role_permissions"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_resourceId_role_key" ON "role_permissions"("resourceId", "role");

-- CreateIndex
CREATE INDEX "AccessLevel_organizationId_idx" ON "AccessLevel"("organizationId");

-- CreateIndex
CREATE INDEX "AccessLevel_isActive_idx" ON "AccessLevel"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_phoneNumber_key" ON "Contact"("phoneNumber");

-- CreateIndex
CREATE INDEX "Contact_phoneNumber_idx" ON "Contact"("phoneNumber");

-- CreateIndex
CREATE INDEX "Contact_name_idx" ON "Contact"("name");

-- CreateIndex
CREATE INDEX "Contact_organizationId_idx" ON "Contact"("organizationId");

-- CreateIndex
CREATE INDEX "Contact_source_idx" ON "Contact"("source");

-- CreateIndex
CREATE INDEX "Contact_externalId_idx" ON "Contact"("externalId");

-- CreateIndex
CREATE INDEX "ChatSession_contactId_idx" ON "ChatSession"("contactId");

-- CreateIndex
CREATE INDEX "ChatSession_connectionId_idx" ON "ChatSession"("connectionId");

-- CreateIndex
CREATE INDEX "ChatSession_organizationId_idx" ON "ChatSession"("organizationId");

-- CreateIndex
CREATE INDEX "ChatSession_status_idx" ON "ChatSession"("status");

-- CreateIndex
CREATE INDEX "ChatSession_aiBlockedUntil_idx" ON "ChatSession"("aiBlockedUntil");

-- CreateIndex
CREATE INDEX "ChatSession_lastMessageAt_idx" ON "ChatSession"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatSession_expiresAt_idx" ON "ChatSession"("expiresAt");

-- CreateIndex
CREATE INDEX "ChatSession_pausedUntil_idx" ON "ChatSession"("pausedUntil");

-- CreateIndex
CREATE INDEX "ChatSession_whatsappWindowExpiresAt_idx" ON "ChatSession"("whatsappWindowExpiresAt");

-- CreateIndex
CREATE INDEX "ChatSession_assignedDepartmentId_idx" ON "ChatSession"("assignedDepartmentId");

-- CreateIndex
CREATE INDEX "ChatSession_assignedAgentId_idx" ON "ChatSession"("assignedAgentId");

-- CreateIndex
CREATE INDEX "ChatSession_externalId_idx" ON "ChatSession"("externalId");

-- CreateIndex
CREATE INDEX "ChatSession_aiAgentConfigId_idx" ON "ChatSession"("aiAgentConfigId");

-- CreateIndex
CREATE INDEX "ChatSession_customerJourney_idx" ON "ChatSession"("customerJourney");

-- CreateIndex
CREATE UNIQUE INDEX "group_chats_groupJid_key" ON "group_chats"("groupJid");

-- CreateIndex
CREATE INDEX "group_chats_connectionId_idx" ON "group_chats"("connectionId");

-- CreateIndex
CREATE INDEX "group_chats_organizationId_idx" ON "group_chats"("organizationId");

-- CreateIndex
CREATE INDEX "group_chats_mode_idx" ON "group_chats"("mode");

-- CreateIndex
CREATE INDEX "group_chats_sessionStatus_idx" ON "group_chats"("sessionStatus");

-- CreateIndex
CREATE INDEX "group_chats_lastMessageAt_idx" ON "group_chats"("lastMessageAt");

-- CreateIndex
CREATE INDEX "group_participants_groupId_idx" ON "group_participants"("groupId");

-- CreateIndex
CREATE INDEX "group_participants_contactId_idx" ON "group_participants"("contactId");

-- CreateIndex
CREATE INDEX "group_participants_participantJid_idx" ON "group_participants"("participantJid");

-- CreateIndex
CREATE INDEX "group_participants_isActive_idx" ON "group_participants"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "group_participants_groupId_participantJid_key" ON "group_participants"("groupId", "participantJid");

-- CreateIndex
CREATE UNIQUE INDEX "group_messages_waMessageId_key" ON "group_messages"("waMessageId");

-- CreateIndex
CREATE INDEX "group_messages_groupId_idx" ON "group_messages"("groupId");

-- CreateIndex
CREATE INDEX "group_messages_participantJid_idx" ON "group_messages"("participantJid");

-- CreateIndex
CREATE INDEX "group_messages_waMessageId_idx" ON "group_messages"("waMessageId");

-- CreateIndex
CREATE INDEX "group_messages_createdAt_idx" ON "group_messages"("createdAt");

-- CreateIndex
CREATE INDEX "session_notes_sessionId_idx" ON "session_notes"("sessionId");

-- CreateIndex
CREATE INDEX "session_notes_authorId_idx" ON "session_notes"("authorId");

-- CreateIndex
CREATE INDEX "session_notes_createdAt_idx" ON "session_notes"("createdAt");

-- CreateIndex
CREATE INDEX "quick_replies_organizationId_idx" ON "quick_replies"("organizationId");

-- CreateIndex
CREATE INDEX "quick_replies_createdById_idx" ON "quick_replies"("createdById");

-- CreateIndex
CREATE INDEX "quick_replies_category_idx" ON "quick_replies"("category");

-- CreateIndex
CREATE INDEX "quick_replies_isActive_idx" ON "quick_replies"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "quick_replies_organizationId_shortcut_key" ON "quick_replies"("organizationId", "shortcut");

-- CreateIndex
CREATE UNIQUE INDEX "Message_waMessageId_key" ON "Message"("waMessageId");

-- CreateIndex
CREATE INDEX "Message_sessionId_idx" ON "Message"("sessionId");

-- CreateIndex
CREATE INDEX "Message_contactId_idx" ON "Message"("contactId");

-- CreateIndex
CREATE INDEX "Message_connectionId_idx" ON "Message"("connectionId");

-- CreateIndex
CREATE INDEX "Message_waMessageId_idx" ON "Message"("waMessageId");

-- CreateIndex
CREATE INDEX "Message_concatGroupId_idx" ON "Message"("concatGroupId");

-- CreateIndex
CREATE INDEX "Message_transcriptionStatus_idx" ON "Message"("transcriptionStatus");

-- CreateIndex
CREATE INDEX "Message_aiAgentId_idx" ON "Message"("aiAgentId");

-- CreateIndex
CREATE INDEX "Message_aiModel_idx" ON "Message"("aiModel");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "Tabulation_organizationId_idx" ON "Tabulation"("organizationId");

-- CreateIndex
CREATE INDEX "Tabulation_name_idx" ON "Tabulation"("name");

-- CreateIndex
CREATE INDEX "ContactTabulation_contactId_idx" ON "ContactTabulation"("contactId");

-- CreateIndex
CREATE INDEX "ContactTabulation_tabulationId_idx" ON "ContactTabulation"("tabulationId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactTabulation_contactId_tabulationId_key" ON "ContactTabulation"("contactId", "tabulationId");

-- CreateIndex
CREATE INDEX "SessionTabulation_sessionId_idx" ON "SessionTabulation"("sessionId");

-- CreateIndex
CREATE INDEX "SessionTabulation_tabulationId_idx" ON "SessionTabulation"("tabulationId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTabulation_sessionId_tabulationId_key" ON "SessionTabulation"("sessionId", "tabulationId");

-- CreateIndex
CREATE INDEX "TabulationIntegration_tabulationId_idx" ON "TabulationIntegration"("tabulationId");

-- CreateIndex
CREATE INDEX "TabulationIntegration_connectionId_idx" ON "TabulationIntegration"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "TabulationIntegration_tabulationId_connectionId_key" ON "TabulationIntegration"("tabulationId", "connectionId");

-- CreateIndex
CREATE INDEX "TabulationSetting_tabulationId_idx" ON "TabulationSetting"("tabulationId");

-- CreateIndex
CREATE UNIQUE INDEX "TabulationSetting_tabulationId_key_key" ON "TabulationSetting"("tabulationId", "key");

-- CreateIndex
CREATE INDEX "Attribute_organizationId_idx" ON "Attribute"("organizationId");

-- CreateIndex
CREATE INDEX "Attribute_type_idx" ON "Attribute"("type");

-- CreateIndex
CREATE INDEX "Attribute_isActive_idx" ON "Attribute"("isActive");

-- CreateIndex
CREATE INDEX "ContactAttribute_contactId_idx" ON "ContactAttribute"("contactId");

-- CreateIndex
CREATE INDEX "ContactAttribute_attributeId_idx" ON "ContactAttribute"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactAttribute_contactId_attributeId_key" ON "ContactAttribute"("contactId", "attributeId");

-- CreateIndex
CREATE INDEX "KanbanBoard_organizationId_idx" ON "KanbanBoard"("organizationId");

-- CreateIndex
CREATE INDEX "KanbanBoard_isActive_idx" ON "KanbanBoard"("isActive");

-- CreateIndex
CREATE INDEX "KanbanColumn_boardId_idx" ON "KanbanColumn"("boardId");

-- CreateIndex
CREATE INDEX "KanbanColumn_position_idx" ON "KanbanColumn"("position");

-- CreateIndex
CREATE INDEX "KanbanColumn_tabulationId_idx" ON "KanbanColumn"("tabulationId");

-- CreateIndex
CREATE INDEX "Label_organizationId_idx" ON "Label"("organizationId");

-- CreateIndex
CREATE INDEX "Label_category_idx" ON "Label"("category");

-- CreateIndex
CREATE INDEX "Label_isActive_idx" ON "Label"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Label_organizationId_slug_key" ON "Label"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "ContactObservation_contactId_idx" ON "ContactObservation"("contactId");

-- CreateIndex
CREATE INDEX "ContactObservation_userId_idx" ON "ContactObservation"("userId");

-- CreateIndex
CREATE INDEX "ContactObservation_type_idx" ON "ContactObservation"("type");

-- CreateIndex
CREATE INDEX "ContactObservation_createdAt_idx" ON "ContactObservation"("createdAt");

-- CreateIndex
CREATE INDEX "File_organizationId_idx" ON "File"("organizationId");

-- CreateIndex
CREATE INDEX "File_userId_idx" ON "File"("userId");

-- CreateIndex
CREATE INDEX "File_mimeType_idx" ON "File"("mimeType");

-- CreateIndex
CREATE INDEX "File_createdAt_idx" ON "File"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Call_externalId_key" ON "Call"("externalId");

-- CreateIndex
CREATE INDEX "Call_connectionId_idx" ON "Call"("connectionId");

-- CreateIndex
CREATE INDEX "Call_contactId_idx" ON "Call"("contactId");

-- CreateIndex
CREATE INDEX "Call_organizationId_idx" ON "Call"("organizationId");

-- CreateIndex
CREATE INDEX "Call_initiatedBy_idx" ON "Call"("initiatedBy");

-- CreateIndex
CREATE INDEX "Call_status_idx" ON "Call"("status");

-- CreateIndex
CREATE INDEX "Call_direction_idx" ON "Call"("direction");

-- CreateIndex
CREATE INDEX "Call_externalId_idx" ON "Call"("externalId");

-- CreateIndex
CREATE INDEX "Call_startedAt_idx" ON "Call"("startedAt");

-- CreateIndex
CREATE INDEX "IntegrationConfig_organizationId_idx" ON "IntegrationConfig"("organizationId");

-- CreateIndex
CREATE INDEX "IntegrationConfig_type_idx" ON "IntegrationConfig"("type");

-- CreateIndex
CREATE INDEX "IntegrationConfig_isActive_idx" ON "IntegrationConfig"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_organizationId_type_name_key" ON "IntegrationConfig"("organizationId", "type", "name");

-- CreateIndex
CREATE INDEX "organization_providers_organizationId_category_idx" ON "organization_providers"("organizationId", "category");

-- CreateIndex
CREATE INDEX "organization_providers_organizationId_isActive_idx" ON "organization_providers"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "organization_providers_category_provider_idx" ON "organization_providers"("category", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "organization_providers_organizationId_category_provider_pri_key" ON "organization_providers"("organizationId", "category", "provider", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "SystemConfig_category_idx" ON "SystemConfig"("category");

-- CreateIndex
CREATE INDEX "SystemConfig_key_idx" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "AIAgentConfig_organizationId_idx" ON "AIAgentConfig"("organizationId");

-- CreateIndex
CREATE INDEX "AIAgentConfig_isActive_idx" ON "AIAgentConfig"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AIAgentConfig_organizationId_name_key" ON "AIAgentConfig"("organizationId", "name");

-- CreateIndex
CREATE INDEX "SystemSettings_category_idx" ON "SystemSettings"("category");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSettings_category_key_key" ON "SystemSettings"("category", "key");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_name_key" ON "EmailTemplate"("name");

-- CreateIndex
CREATE INDEX "EmailTemplate_name_idx" ON "EmailTemplate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AIPrompt_name_key" ON "AIPrompt"("name");

-- CreateIndex
CREATE INDEX "AIPrompt_name_idx" ON "AIPrompt"("name");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE INDEX "api_keys_prefix_idx" ON "api_keys"("prefix");

-- CreateIndex
CREATE INDEX "api_keys_isActive_idx" ON "api_keys"("isActive");

-- CreateIndex
CREATE INDEX "api_keys_expiresAt_idx" ON "api_keys"("expiresAt");

-- CreateIndex
CREATE INDEX "log_entries_timestamp_idx" ON "log_entries"("timestamp");

-- CreateIndex
CREATE INDEX "log_entries_level_idx" ON "log_entries"("level");

-- CreateIndex
CREATE INDEX "log_entries_source_idx" ON "log_entries"("source");

-- CreateIndex
CREATE INDEX "log_entries_userId_idx" ON "log_entries"("userId");

-- CreateIndex
CREATE INDEX "log_entries_organizationId_idx" ON "log_entries"("organizationId");

-- CreateIndex
CREATE INDEX "log_entries_connectionId_idx" ON "log_entries"("connectionId");

-- CreateIndex
CREATE INDEX "log_entries_sessionId_idx" ON "log_entries"("sessionId");

-- CreateIndex
CREATE INDEX "log_entries_requestId_idx" ON "log_entries"("requestId");

-- CreateIndex
CREATE INDEX "log_entries_aiPatternMatch_idx" ON "log_entries"("aiPatternMatch");

-- CreateIndex
CREATE INDEX "log_entries_aiSeverity_idx" ON "log_entries"("aiSeverity");

-- CreateIndex
CREATE INDEX "log_analyses_createdAt_idx" ON "log_analyses"("createdAt");

-- CreateIndex
CREATE INDEX "log_analyses_type_idx" ON "log_analyses"("type");

-- CreateIndex
CREATE INDEX "log_analyses_periodStart_periodEnd_idx" ON "log_analyses"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_organizationId_idx" ON "notifications"("organizationId");

-- CreateIndex
CREATE INDEX "notifications_role_idx" ON "notifications"("role");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_isGlobal_idx" ON "notifications"("isGlobal");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_scheduledFor_idx" ON "notifications"("scheduledFor");

-- CreateIndex
CREATE INDEX "notifications_expiresAt_idx" ON "notifications"("expiresAt");

-- CreateIndex
CREATE INDEX "notification_reads_userId_idx" ON "notification_reads"("userId");

-- CreateIndex
CREATE INDEX "notification_reads_notificationId_idx" ON "notification_reads"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_reads_notificationId_userId_key" ON "notification_reads"("notificationId", "userId");

-- AddForeignKey
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasskeyCredential" ADD CONSTRAINT "PasskeyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationCode" ADD CONSTRAINT "VerificationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_assignedCustomerId_fkey" FOREIGN KEY ("assignedCustomerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_settings" ADD CONSTRAINT "connection_settings_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_events" ADD CONSTRAINT "connection_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "n8n_call_logs" ADD CONSTRAINT "n8n_call_logs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "permission_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_assignedDepartmentId_fkey" FOREIGN KEY ("assignedDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_aiAgentConfigId_fkey" FOREIGN KEY ("aiAgentConfigId") REFERENCES "AIAgentConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chats" ADD CONSTRAINT "group_chats_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chats" ADD CONSTRAINT "group_chats_aiAgentConfigId_fkey" FOREIGN KEY ("aiAgentConfigId") REFERENCES "AIAgentConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_participants" ADD CONSTRAINT "group_participants_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "group_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_participants" ADD CONSTRAINT "group_participants_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_participants" ADD CONSTRAINT "group_participants_privateSessionId_fkey" FOREIGN KEY ("privateSessionId") REFERENCES "ChatSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "group_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTabulation" ADD CONSTRAINT "ContactTabulation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTabulation" ADD CONSTRAINT "ContactTabulation_tabulationId_fkey" FOREIGN KEY ("tabulationId") REFERENCES "Tabulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTabulation" ADD CONSTRAINT "SessionTabulation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTabulation" ADD CONSTRAINT "SessionTabulation_tabulationId_fkey" FOREIGN KEY ("tabulationId") REFERENCES "Tabulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabulationIntegration" ADD CONSTRAINT "TabulationIntegration_tabulationId_fkey" FOREIGN KEY ("tabulationId") REFERENCES "Tabulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabulationIntegration" ADD CONSTRAINT "TabulationIntegration_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabulationSetting" ADD CONSTRAINT "TabulationSetting_tabulationId_fkey" FOREIGN KEY ("tabulationId") REFERENCES "Tabulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAttribute" ADD CONSTRAINT "ContactAttribute_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAttribute" ADD CONSTRAINT "ContactAttribute_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "Attribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanColumn" ADD CONSTRAINT "KanbanColumn_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanColumn" ADD CONSTRAINT "KanbanColumn_tabulationId_fkey" FOREIGN KEY ("tabulationId") REFERENCES "Tabulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactObservation" ADD CONSTRAINT "ContactObservation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactObservation" ADD CONSTRAINT "ContactObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_initiatedBy_fkey" FOREIGN KEY ("initiatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_providers" ADD CONSTRAINT "organization_providers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Pre-mark existing incremental migrations as applied
-- (they are redundant since this init migration creates the full current schema)
INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
VALUES
  (gen_random_uuid()::text, 'pre-applied-by-init', '20251011123357_add_onboarding_and_business_hours', now(), now(), 1),
  (gen_random_uuid()::text, 'pre-applied-by-init', '20251225123000_add_autopause_and_group_settings', now(), now(), 1),
  (gen_random_uuid()::text, 'pre-applied-by-init', '20251226100000_add_session_notes', now(), now(), 1),
  (gen_random_uuid()::text, 'pre-applied-by-init', '20251226110000_add_quick_replies', now(), now(), 1)
ON CONFLICT DO NOTHING;
