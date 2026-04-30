/**
 * Formata valor em centavos para moeda BRL.
 * @param cents - Valor em centavos (ex: 19700 = R$ 197,00)
 */
export function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}
