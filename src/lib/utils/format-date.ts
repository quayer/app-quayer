/**
 * Formata uma data para o formato brasileiro (dd/mm/aaaa).
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('pt-BR')
}

/**
 * Formata uma data para o formato brasileiro com dia e mes por extenso.
 * Ex: "28 de marco de 2026"
 */
export function formatDateLong(date: string | Date): string {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}
