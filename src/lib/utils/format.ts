import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/**
 * Formata uma data de forma segura, retornando 'N/A' em caso de erro.
 * Usa distância relativa (ex: "há 2 dias").
 */
export function safeFormatDate(date: unknown): string {
  if (!date) return 'N/A'
  try {
    const d = new Date(date as string)
    if (isNaN(d.getTime())) return 'N/A'
    return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
  } catch {
    return 'N/A'
  }
}
