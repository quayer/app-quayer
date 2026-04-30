export const INSTANCE_STATUS_COLOR: Record<string, string> = {
  CONNECTED: '#22C55E',
  connected: '#22C55E',
  CONNECTING: '#EAB308',
  connecting: '#EAB308',
  DISCONNECTED: '#EF4444',
  disconnected: '#EF4444',
  ERROR: '#EF4444',
  CREATED: '#6B7280',
}

export const INSTANCE_STATUS_LABEL: Record<string, string> = {
  CONNECTED: 'Conectado',
  connected: 'Conectado',
  CONNECTING: 'Conectando',
  connecting: 'Conectando',
  DISCONNECTED: 'Desconectado',
  disconnected: 'Desconectado',
  ERROR: 'Erro',
  CREATED: 'Configurando',
}

export function isConnectedStatus(status: string): boolean {
  return status === 'CONNECTED' || status === 'connected'
}

export function isConnectingStatus(status: string): boolean {
  return status === 'CONNECTING' || status === 'connecting'
}
