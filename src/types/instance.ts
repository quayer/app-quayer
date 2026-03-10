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
