/**
 * Share Feature Interfaces
 * Token-based sharing system for client onboarding
 */

export interface ShareToken {
  id: string
  token: string
  instanceId: string
  expiresAt: Date
  usedAt: Date | null
  createdBy: string | null
  createdAt: Date
}

export interface GenerateShareLinkInput {
  instanceId: string
  expiresInHours?: number // Default: 24 hours
}

export interface GenerateShareLinkOutput {
  token: string
  url: string
  expiresAt: Date
}

export interface ValidateTokenInput {
  token: string
}

export interface ValidateTokenOutput {
  valid: boolean
  instanceId?: string
  instanceName?: string
  expiresAt?: Date
}

export interface GenerateClientQRInput {
  token: string
}

export interface GenerateClientQROutput {
  qrCode: string
  expires: number // milliseconds
}

export interface CheckConnectionStatusInput {
  token: string
}

export interface CheckConnectionStatusOutput {
  status: 'pending' | 'connected' | 'expired'
  connectedAt?: Date
}
