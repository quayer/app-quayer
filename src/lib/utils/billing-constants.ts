/**
 * Constantes compartilhadas para paginas de billing/cobranca.
 * Evita duplicacao entre admin e settings pages.
 */

export const INVOICE_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PAID: {
    label: 'Pago',
    className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10',
  },
  PENDING: {
    label: 'Pendente',
    className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/10',
  },
  OVERDUE: {
    label: 'Atrasado',
    className: 'bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/10',
  },
  CANCELED: {
    label: 'Cancelado',
    className: 'bg-gray-500/10 text-gray-500 border-gray-500/20 hover:bg-gray-500/10',
  },
  PROCESSING: {
    label: 'Processando',
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/10',
  },
  DRAFT: {
    label: 'Rascunho',
    className: 'bg-gray-500/10 text-gray-500 border-gray-500/20 hover:bg-gray-500/10',
  },
  REFUNDED: {
    label: 'Reembolsado',
    className: 'bg-purple-500/10 text-purple-600 border-purple-500/20 hover:bg-purple-500/10',
  },
}

export const SUBSCRIPTION_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10' },
  trial: { label: 'Trial', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/10' },
  past_due: { label: 'Inadimplente', className: 'bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/10' },
  suspended: { label: 'Suspenso', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/10' },
  canceled: { label: 'Cancelado', className: 'bg-gray-500/10 text-gray-500 border-gray-500/20 hover:bg-gray-500/10' },
}

export const NFSE_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  NONE: { label: 'Nenhuma', className: 'bg-gray-500/10 text-gray-500 border-gray-500/20 hover:bg-gray-500/10' },
  PENDING_NFSE: { label: 'Pendente', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/10' },
  SCHEDULED: { label: 'Agendada', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/10' },
  SYNCHRONIZED: { label: 'Sincronizada', className: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20 hover:bg-cyan-500/10' },
  AUTHORIZED: { label: 'Autorizada', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10' },
  PROCESSING_CANCELLATION: { label: 'Cancelando', className: 'bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-orange-500/10' },
  CANCELED: { label: 'Cancelada', className: 'bg-gray-500/10 text-gray-500 border-gray-500/20 hover:bg-gray-500/10' },
  CANCELLATION_DENIED: { label: 'Cancelamento Negado', className: 'bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/10' },
  ERROR_NFSE: { label: 'Erro', className: 'bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/10' },
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PIX_AUTO: 'Pix Automatico',
  PIX_MANUAL: 'Pix Manual',
  CREDIT_CARD: 'Cartao de Credito',
  BOLETO: 'Boleto',
}
