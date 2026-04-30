export interface Instance {
  id: string
  name: string
  phoneNumber?: string
  status: 'connected' | 'disconnected' | 'connecting'
  brokerType: string
  brokerId?: string
  webhookUrl?: string
  qrCode?: string
  pairingCode?: string
  lastConnected?: Date
  createdAt: Date
  updatedAt: Date
}

/**
 * Minimal instance type accepted by modal components.
 * Compatible with both full Prisma Instance and AdminInstance (from server actions).
 */
export interface ModalInstance {
  id: string
  name: string
  phoneNumber: string | null
  status: string
  brokerType: string
  createdAt: string | Date
  updatedAt?: string | Date
  uazapiToken?: string | null
  brokerId?: string | null
  organization?: { id: string; name: string } | null
}

export interface CreateInstanceRequest {
  name: string
  phoneNumber?: string
  brokerType?: string
  webhookUrl?: string
}

export interface QRCodeResponse {
  qrcode: string
  expires: number
  pairingCode?: string
}

export interface UAZapiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface InstanceStatusResponse {
  status: 'connected' | 'disconnected' | 'connecting'
  phoneNumber?: string
  name?: string
  lastSeen?: Date
}

export interface ConnectionResponse {
  success: boolean
  qrcode?: string
  pairingCode?: string
  expires?: number
  message?: string
}
