import { parsePhoneNumber, isValidPhoneNumber, type CountryCode } from 'libphonenumber-js'

/**
 * @interface PhoneValidationResult
 * @description Resultado da validação de número de telefone
 */
export interface PhoneValidationResult {
  isValid: boolean
  formatted?: string
  country?: string
  nationalNumber?: string
  internationalNumber?: string
  error?: string
}

/**
 * @function validatePhoneNumber
 * @description Valida e formata número de telefone internacional
 * @param {string} phoneNumber - Número de telefone a ser validado
 * @param {CountryCode} defaultCountry - Código do país padrão (ex: 'BR')
 * @returns {PhoneValidationResult} Resultado da validação
 */
export function validatePhoneNumber(
  phoneNumber: string,
  defaultCountry: CountryCode = 'BR'
): PhoneValidationResult {
  try {
    // Remove espaços e caracteres especiais para validação inicial
    const cleanedNumber = phoneNumber.trim()

    if (!cleanedNumber) {
      return {
        isValid: false,
        error: 'Número de telefone não pode estar vazio'
      }
    }

    // Valida se é um número de telefone válido
    if (!isValidPhoneNumber(cleanedNumber, defaultCountry)) {
      return {
        isValid: false,
        error: 'Número de telefone inválido'
      }
    }

    // Parse o número para obter detalhes
    const parsed = parsePhoneNumber(cleanedNumber, defaultCountry)

    return {
      isValid: true,
      formatted: parsed.format('E.164'), // Formato internacional (ex: +5511999999999)
      country: parsed.country,
      nationalNumber: parsed.nationalNumber,
      internationalNumber: parsed.formatInternational()
    }
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Erro ao validar número de telefone'
    }
  }
}

/**
 * @function formatWhatsAppNumber
 * @description Formata número para uso no WhatsApp (sem + e sem espaços)
 * @param {string} phoneNumber - Número de telefone
 * @param {CountryCode} defaultCountry - Código do país padrão
 * @returns {string | null} Número formatado ou null se inválido
 */
export function formatWhatsAppNumber(
  phoneNumber: string,
  defaultCountry: CountryCode = 'BR'
): string | null {
  const validation = validatePhoneNumber(phoneNumber, defaultCountry)

  if (!validation.isValid || !validation.formatted) {
    return null
  }

  // Remove o '+' do formato E.164 para uso no WhatsApp
  return validation.formatted.replace('+', '')
}

/**
 * @function isValidBrazilianPhone
 * @description Valida especificamente números de telefone brasileiros
 * @param {string} phoneNumber - Número de telefone
 * @returns {boolean} True se for um número brasileiro válido
 */
export function isValidBrazilianPhone(phoneNumber: string): boolean {
  const validation = validatePhoneNumber(phoneNumber, 'BR')
  return validation.isValid && validation.country === 'BR'
}
