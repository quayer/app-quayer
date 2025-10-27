import { z } from "zod";

// ==================== ENUMS ====================
export enum InstanceStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  ERROR = 'error',
}

// ✅ CORREÇÃO BRUTAL: Usar valores MAIÚSCULOS para match com Prisma schema
export enum BrokerType {
  UAZAPI = 'UAZAPI',
  EVOLUTION = 'EVOLUTION',
  BAILEYS = 'BAILEYS',
  OFFICIAL = 'OFFICIAL',
  WPPCONNECT = 'WPPCONNECT',
}

export enum ErrorCode {
  INSTANCE_NAME_EXISTS = 'INSTANCE_NAME_EXISTS',
  INSTANCE_NOT_FOUND = 'INSTANCE_NOT_FOUND',
  UAZAPI_CONNECTION_FAILED = 'UAZAPI_CONNECTION_FAILED',
  UAZAPI_DISCONNECTION_FAILED = 'UAZAPI_DISCONNECTION_FAILED',
  UAZAPI_DELETE_FAILED = 'UAZAPI_DELETE_FAILED',
  INVALID_PHONE_FORMAT = 'INVALID_PHONE_FORMAT',
  INVALID_WEBHOOK_URL = 'INVALID_WEBHOOK_URL',
  INSTANCE_ALREADY_CONNECTED = 'INSTANCE_ALREADY_CONNECTED',
  MISSING_UAZAPI_TOKEN = 'MISSING_UAZAPI_TOKEN',
  INVALID_QR_CODE = 'INVALID_QR_CODE',
  ORGANIZATION_PERMISSION_DENIED = 'ORGANIZATION_PERMISSION_DENIED',
}

// ==================== REQUEST DTOs ====================

// Validação de número de telefone internacional (E.164)
const phoneNumberSchema = z.string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Formato de telefone inválido. Use formato internacional: +5511999999999")
  .optional();

// Validação de URL com HTTPS obrigatório para webhooks
const webhookUrlSchema = z.union([
  z.string()
    .url("URL inválida")
    .refine(url => url.startsWith('https://'), {
      message: "Webhook deve usar HTTPS para segurança"
    }),
  z.null(),
  z.undefined()
]).optional();

/**
 * @constant CreateInstanceRequestDTO
 * @description Schema Zod para validação da criação de nova instância WhatsApp
 */
export const CreateInstanceRequestDTO = z.object({
  name: z.string()
    .min(3, "Nome deve ter no mínimo 3 caracteres")
    .max(100, "Nome deve ter no máximo 100 caracteres")
    .regex(/^[a-zA-Z0-9\s-_]+$/, "Nome deve conter apenas letras, números, espaços, hífens e underscores"),
  phoneNumber: phoneNumberSchema,
  brokerType: z.nativeEnum(BrokerType).default(BrokerType.UAZAPI),
  webhookUrl: webhookUrlSchema,
  uazToken: z.string().optional(),  // Fixed: Changed from uazapiToken to uazToken
  uazInstanceId: z.string().optional(),  // Fixed: Changed from brokerId to uazInstanceId
  organizationId: z.string().uuid().optional(),
});

/**
 * @constant UpdateInstanceRequestDTO
 * @description Schema Zod para validação da atualização de instância
 */
export const UpdateInstanceRequestDTO = z.object({
  name: z.string()
    .min(3, "Nome deve ter no mínimo 3 caracteres")
    .max(100, "Nome deve ter no máximo 100 caracteres")
    .regex(/^[a-zA-Z0-9\s-_]+$/, "Nome deve conter apenas letras, números, espaços, hífens e underscores")
    .optional(),
  phoneNumber: phoneNumberSchema,
  brokerType: z.nativeEnum(BrokerType).optional(),
  webhookUrl: webhookUrlSchema,
  uazToken: z.string().optional(),  // Fixed: Changed from uazapiToken to uazToken
  uazInstanceId: z.string().optional(),  // Fixed: Changed from brokerId to uazInstanceId
});

/**
 * @constant ConnectInstanceRequestDTO
 * @description Schema Zod para validação da conexão de instância
 */
export const ConnectInstanceRequestDTO = z.object({
  phone: phoneNumberSchema,
});

/**
 * @constant ListInstancesQueryDTO
 * @description Schema Zod para validação de listagem com paginação e filtros
 */
export const ListInstancesQueryDTO = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['connected', 'disconnected', 'connecting', 'all']).default('all'),
  search: z.string().optional(),
});

// ==================== RESPONSE DTOs ====================

/**
 * @constant InstanceResponseDTO
 * @description Schema Zod para resposta de instância individual
 */
export const InstanceResponseDTO = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phoneNumber: z.string().nullable(),
  status: z.enum(['connected', 'disconnected', 'connecting', 'error']),
  qrCode: z.string().nullable(),
  pairingCode: z.string().nullable(),
  brokerType: z.nativeEnum(BrokerType),
  webhookUrl: z.string().nullable(),
  brokerId: z.string().nullable(),
  organizationId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * @constant InstanceListResponseDTO
 * @description Schema Zod para resposta de lista paginada
 */
export const InstanceListResponseDTO = z.object({
  data: z.array(InstanceResponseDTO),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

/**
 * @constant QRCodeResponseDTO
 * @description Schema Zod para resposta do QR Code
 */
export const QRCodeResponseDTO = z.object({
  qrcode: z.string().min(1, "QR Code não pode estar vazio"),
  expires: z.number().int().positive().default(120000), // 2 minutos em ms
  pairingCode: z.string().optional(),
});

/**
 * @constant InstanceStatusResponseDTO
 * @description Schema Zod para resposta do status da instância
 */
export const InstanceStatusResponseDTO = z.object({
  status: z.enum(['connected', 'disconnected', 'connecting', 'error']),
  phoneNumber: z.string().optional(),
  name: z.string().optional(),
  lastSeen: z.date().optional(),
});

/**
 * @constant ErrorResponseDTO
 * @description Schema Zod para resposta de erro estruturado
 */
export const ErrorResponseDTO = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  details: z.any().optional(),
  timestamp: z.date().default(() => new Date()),
});

/**
 * @constant SuccessResponseDTO
 * @description Schema Zod para resposta de sucesso genérica
 */
export const SuccessResponseDTO = z.object({
  message: z.string(),
  data: z.any().optional(),
});

// ==================== TYPES ====================

// Request Types
export type CreateInstanceRequest = z.infer<typeof CreateInstanceRequestDTO>;
export type UpdateInstanceRequest = z.infer<typeof UpdateInstanceRequestDTO>;
export type ConnectInstanceRequest = z.infer<typeof ConnectInstanceRequestDTO>;
export type ListInstancesQuery = z.infer<typeof ListInstancesQueryDTO>;

// Response Types
export type InstanceResponse = z.infer<typeof InstanceResponseDTO>;
export type InstanceListResponse = z.infer<typeof InstanceListResponseDTO>;
export type QRCodeResponse = z.infer<typeof QRCodeResponseDTO>;
export type InstanceStatusResponse = z.infer<typeof InstanceStatusResponseDTO>;
export type ErrorResponse = z.infer<typeof ErrorResponseDTO>;
export type SuccessResponse = z.infer<typeof SuccessResponseDTO>;

// Legacy compatibility exports
export const CreateInstanceSchema = CreateInstanceRequestDTO;
export const UpdateInstanceSchema = UpdateInstanceRequestDTO;
export const ConnectInstanceSchema = ConnectInstanceRequestDTO;
export const InstanceResponseSchema = InstanceResponseDTO;
export const QRCodeResponseSchema = QRCodeResponseDTO;
export const InstanceStatusResponseSchema = InstanceStatusResponseDTO;

// Legacy type exports
export type CreateInstanceInput = CreateInstanceRequest;
export type UpdateInstanceInput = UpdateInstanceRequest;
