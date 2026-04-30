/**
 * Document Validator Tests
 *
 * Unit tests for CPF and CNPJ validation
 */

import { describe, it, expect } from 'vitest'
import {
  validateCPF,
  validateCNPJ,
  validateDocument,
  formatCPF,
  formatCNPJ,
  formatDocument,
} from './document-validator'

describe('validateCPF', () => {
  it('should validate correct CPF', () => {
    expect(validateCPF('111.444.777-35')).toBe(true)
    expect(validateCPF('11144477735')).toBe(true)
  })

  it('should invalidate incorrect CPF', () => {
    expect(validateCPF('111.444.777-34')).toBe(false) // Wrong check digit
    expect(validateCPF('11144477734')).toBe(false)
  })

  it('should invalidate CPF with all same digits', () => {
    expect(validateCPF('111.111.111-11')).toBe(false)
    expect(validateCPF('00000000000')).toBe(false)
    expect(validateCPF('99999999999')).toBe(false)
  })

  it('should invalidate CPF with wrong length', () => {
    expect(validateCPF('111.444.777')).toBe(false)
    expect(validateCPF('11144477')).toBe(false)
  })

  it('should handle CPF with or without formatting', () => {
    const cpf = '111.444.777-35'
    const unformatted = '11144477735'
    expect(validateCPF(cpf)).toBe(validateCPF(unformatted))
  })
})

describe('validateCNPJ', () => {
  it('should validate correct CNPJ', () => {
    expect(validateCNPJ('11.222.333/0001-81')).toBe(true)
    expect(validateCNPJ('11222333000181')).toBe(true)
  })

  it('should invalidate incorrect CNPJ', () => {
    expect(validateCNPJ('11.222.333/0001-82')).toBe(false) // Wrong check digit
    expect(validateCNPJ('11222333000182')).toBe(false)
  })

  it('should invalidate CNPJ with all same digits', () => {
    expect(validateCNPJ('11.111.111/1111-11')).toBe(false)
    expect(validateCNPJ('00000000000000')).toBe(false)
    expect(validateCNPJ('99999999999999')).toBe(false)
  })

  it('should invalidate CNPJ with wrong length', () => {
    expect(validateCNPJ('11.222.333/0001')).toBe(false)
    expect(validateCNPJ('112223330001')).toBe(false)
  })

  it('should handle CNPJ with or without formatting', () => {
    const cnpj = '11.222.333/0001-81'
    const unformatted = '11222333000181'
    expect(validateCNPJ(cnpj)).toBe(validateCNPJ(unformatted))
  })
})

describe('validateDocument', () => {
  it('should identify and validate CPF', () => {
    const result = validateDocument('111.444.777-35')
    expect(result.type).toBe('cpf')
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should identify and validate CNPJ', () => {
    const result = validateDocument('11.222.333/0001-81')
    expect(result.type).toBe('cnpj')
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should return error for invalid CPF', () => {
    const result = validateDocument('111.444.777-34')
    expect(result.type).toBe('cpf')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('CPF inválido')
  })

  it('should return error for invalid CNPJ', () => {
    const result = validateDocument('11.222.333/0001-82')
    expect(result.type).toBe('cnpj')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('CNPJ inválido')
  })

  it('should return error for unknown document type', () => {
    const result = validateDocument('123456')
    expect(result.type).toBe('unknown')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ)')
  })
})

describe('formatCPF', () => {
  it('should format CPF correctly', () => {
    expect(formatCPF('11144477735')).toBe('111.444.777-35')
  })

  it('should handle already formatted CPF', () => {
    expect(formatCPF('111.444.777-35')).toBe('111.444.777-35')
  })

  it('should handle partial CPF', () => {
    expect(formatCPF('11144')).toBe('111.44')
    expect(formatCPF('111447')).toBe('111.447')
    expect(formatCPF('1114477')).toBe('111.447.7')
  })

  it('should limit to 11 digits', () => {
    expect(formatCPF('111444777351234567')).toBe('111.444.777-35')
  })
})

describe('formatCNPJ', () => {
  it('should format CNPJ correctly', () => {
    expect(formatCNPJ('11222333000181')).toBe('11.222.333/0001-81')
  })

  it('should handle already formatted CNPJ', () => {
    expect(formatCNPJ('11.222.333/0001-81')).toBe('11.222.333/0001-81')
  })

  it('should handle partial CNPJ', () => {
    expect(formatCNPJ('1122')).toBe('11.22')
    expect(formatCNPJ('112223')).toBe('11.222.3')
    expect(formatCNPJ('11222333')).toBe('11.222.333')
    expect(formatCNPJ('112223330')).toBe('11.222.333/0')
  })

  it('should limit to 14 digits', () => {
    expect(formatCNPJ('112223330001811234567')).toBe('11.222.333/0001-81')
  })
})

describe('formatDocument', () => {
  it('should format CPF when type is pf', () => {
    expect(formatDocument('11144477735', 'pf')).toBe('111.444.777-35')
  })

  it('should format CNPJ when type is pj', () => {
    expect(formatDocument('11222333000181', 'pj')).toBe('11.222.333/0001-81')
  })

  it('should handle partial documents', () => {
    expect(formatDocument('11144', 'pf')).toBe('111.44')
    expect(formatDocument('1122', 'pj')).toBe('11.22')
  })
})
