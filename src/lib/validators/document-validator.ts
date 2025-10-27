/**
 * Document Validator - CPF and CNPJ validation
 *
 * Validates Brazilian CPF (11 digits) and CNPJ (14 digits) documents
 */

/**
 * Validate CPF (Cadastro de Pessoas Físicas)
 * @param cpf - CPF string (can be formatted or not)
 * @returns true if valid, false otherwise
 */
export function validateCPF(cpf: string): boolean {
  // Remove non-numeric characters
  const cleanCPF = cpf.replace(/\D/g, '')

  // Check if has 11 digits
  if (cleanCPF.length !== 11) {
    return false
  }

  // Check if all digits are the same (invalid CPF)
  if (/^(\d)\1{10}$/.test(cleanCPF)) {
    return false
  }

  // Validate first check digit
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (10 - i)
  }
  let checkDigit = 11 - (sum % 11)
  if (checkDigit >= 10) checkDigit = 0

  if (checkDigit !== parseInt(cleanCPF.charAt(9))) {
    return false
  }

  // Validate second check digit
  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (11 - i)
  }
  checkDigit = 11 - (sum % 11)
  if (checkDigit >= 10) checkDigit = 0

  if (checkDigit !== parseInt(cleanCPF.charAt(10))) {
    return false
  }

  return true
}

/**
 * Validate CNPJ (Cadastro Nacional da Pessoa Jurídica)
 * @param cnpj - CNPJ string (can be formatted or not)
 * @returns true if valid, false otherwise
 */
export function validateCNPJ(cnpj: string): boolean {
  // Remove non-numeric characters
  const cleanCNPJ = cnpj.replace(/\D/g, '')

  // Check if has 14 digits
  if (cleanCNPJ.length !== 14) {
    return false
  }

  // Check if all digits are the same (invalid CNPJ)
  if (/^(\d)\1{13}$/.test(cleanCNPJ)) {
    return false
  }

  // Validate first check digit
  let length = cleanCNPJ.length - 2
  let numbers = cleanCNPJ.substring(0, length)
  const digits = cleanCNPJ.substring(length)
  let sum = 0
  let pos = length - 7

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--
    if (pos < 2) pos = 9
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  if (result !== parseInt(digits.charAt(0))) {
    return false
  }

  // Validate second check digit
  length = length + 1
  numbers = cleanCNPJ.substring(0, length)
  sum = 0
  pos = length - 7

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--
    if (pos < 2) pos = 9
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  if (result !== parseInt(digits.charAt(1))) {
    return false
  }

  return true
}

/**
 * Validate document (CPF or CNPJ) based on length
 * @param document - Document string
 * @returns { valid: boolean, type: 'cpf' | 'cnpj' | 'unknown', error?: string }
 */
export function validateDocument(document: string): {
  valid: boolean
  type: 'cpf' | 'cnpj' | 'unknown'
  error?: string
} {
  const clean = document.replace(/\D/g, '')

  if (clean.length === 11) {
    const valid = validateCPF(document)
    return {
      valid,
      type: 'cpf',
      error: valid ? undefined : 'CPF inválido',
    }
  }

  if (clean.length === 14) {
    const valid = validateCNPJ(document)
    return {
      valid,
      type: 'cnpj',
      error: valid ? undefined : 'CNPJ inválido',
    }
  }

  return {
    valid: false,
    type: 'unknown',
    error: 'Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ)',
  }
}

/**
 * Format CPF
 * @param cpf - CPF string
 * @returns formatted CPF (000.000.000-00)
 */
export function formatCPF(cpf: string): string {
  const clean = cpf.replace(/\D/g, '')
  return clean
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

/**
 * Format CNPJ
 * @param cnpj - CNPJ string
 * @returns formatted CNPJ (00.000.000/0000-00)
 */
export function formatCNPJ(cnpj: string): string {
  const clean = cnpj.replace(/\D/g, '')
  return clean
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/**
 * Format document based on type
 * @param document - Document string
 * @param type - 'pf' (CPF) or 'pj' (CNPJ)
 * @returns formatted document
 */
export function formatDocument(document: string, type: 'pf' | 'pj'): string {
  if (type === 'pf') {
    return formatCPF(document)
  }
  return formatCNPJ(document)
}
