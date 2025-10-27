import { describe, it, expect } from 'vitest'
import {
  validatePhoneNumber,
  formatWhatsAppNumber,
  isValidBrazilianPhone
} from '@/lib/validators/phone.validator'

/**
 * @test Unit Tests - Phone Validator
 * @description Testes unitários completos para validação de telefone
 */

describe('validatePhoneNumber', () => {
  describe('Telefones brasileiros válidos', () => {
    it('Deve aceitar telefone com código +55', () => {
      const result = validatePhoneNumber('+5511999887766')

      expect(result.isValid).toBe(true)
      expect(result.formatted).toBe('+5511999887766')
      expect(result.country).toBe('BR')
    })

    it('Deve aceitar telefone sem código +', () => {
      const result = validatePhoneNumber('5511999887766')

      expect(result.isValid).toBe(true)
      expect(result.formatted).toBe('+5511999887766')
    })

    it('Deve aceitar telefone apenas com DDD', () => {
      const result = validatePhoneNumber('11999887766')

      expect(result.isValid).toBe(true)
      expect(result.formatted).toBe('+5511999887766')
    })

    it('Deve aceitar diferentes DDDs brasileiros', () => {
      const phones = [
        '11999887766', // SP
        '21988776655', // RJ
        '85987654321', // CE
        '47999888777', // SC
      ]

      phones.forEach(phone => {
        const result = validatePhoneNumber(phone)
        expect(result.isValid).toBe(true)
        expect(result.country).toBe('BR')
      })
    })
  })

  describe('Telefones internacionais válidos', () => {
    it('Deve aceitar telefone dos EUA', () => {
      const result = validatePhoneNumber('+14155552671', 'US')

      expect(result.isValid).toBe(true)
      expect(result.country).toBe('US')
    })

    it('Deve aceitar telefone da Argentina', () => {
      const result = validatePhoneNumber('+5491112345678', 'AR')

      expect(result.isValid).toBe(true)
      expect(result.country).toBe('AR')
    })

    it('Deve aceitar telefone de Portugal', () => {
      const result = validatePhoneNumber('+351912345678', 'PT')

      expect(result.isValid).toBe(true)
      expect(result.country).toBe('PT')
    })
  })

  describe('Telefones inválidos', () => {
    it('Deve rejeitar string vazia', () => {
      const result = validatePhoneNumber('')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('vazio')
    })

    it('Deve rejeitar número muito curto', () => {
      const result = validatePhoneNumber('123')

      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('Deve rejeitar número com letras', () => {
      const result = validatePhoneNumber('abc123def')

      expect(result.isValid).toBe(false)
    })

    it('Deve rejeitar número com muitos dígitos', () => {
      const result = validatePhoneNumber('+99999999999999999')

      expect(result.isValid).toBe(false)
    })

    it('Deve rejeitar apenas zeros', () => {
      const result = validatePhoneNumber('00000000000')

      expect(result.isValid).toBe(false)
    })
  })

  describe('Formato E.164', () => {
    it('Deve retornar formato E.164 correto', () => {
      const result = validatePhoneNumber('11999887766')

      expect(result.formatted).toMatch(/^\+\d+$/)
      expect(result.formatted).toBe('+5511999887766')
    })

    it('Deve retornar número internacional formatado', () => {
      const result = validatePhoneNumber('11999887766')

      // libphonenumber-js retorna formato com espaço, não hífen
      expect(result.internationalNumber).toBe('+55 11 99988 7766')
    })

    it('Deve retornar número nacional', () => {
      const result = validatePhoneNumber('11999887766')

      expect(result.nationalNumber).toBe('11999887766')
    })
  })
})

describe('formatWhatsAppNumber', () => {
  it('Deve remover + do formato E.164', () => {
    const result = formatWhatsAppNumber('+5511999887766')

    expect(result).toBe('5511999887766')
    expect(result).not.toContain('+')
  })

  it('Deve formatar número brasileiro', () => {
    const result = formatWhatsAppNumber('11999887766')

    expect(result).toBe('5511999887766')
  })

  it('Deve retornar null para número inválido', () => {
    const result = formatWhatsAppNumber('123')

    expect(result).toBeNull()
  })

  it('Deve aceitar número já sem +', () => {
    const result = formatWhatsAppNumber('5511999887766')

    expect(result).toBe('5511999887766')
  })
})

describe('isValidBrazilianPhone', () => {
  it('Deve validar telefone brasileiro correto', () => {
    expect(isValidBrazilianPhone('+5511999887766')).toBe(true)
    expect(isValidBrazilianPhone('11999887766')).toBe(true)
    expect(isValidBrazilianPhone('5511999887766')).toBe(true)
  })

  it('Deve rejeitar telefone de outro país', () => {
    expect(isValidBrazilianPhone('+14155552671')).toBe(false)
  })

  it('Deve rejeitar telefone inválido', () => {
    expect(isValidBrazilianPhone('123')).toBe(false)
    expect(isValidBrazilianPhone('abc')).toBe(false)
  })

  it('Deve validar diferentes DDDs brasileiros', () => {
    const brazilianPhones = [
      '11999887766',
      '21988776655',
      '85987654321',
      '47999888777',
      '61987654321',
    ]

    brazilianPhones.forEach(phone => {
      expect(isValidBrazilianPhone(phone)).toBe(true)
    })
  })
})

describe('Edge cases', () => {
  it('Deve lidar com espaços no número', () => {
    const result = validatePhoneNumber('  11 99988 7766  ')

    expect(result.isValid).toBe(true)
  })

  it('Deve lidar com caracteres especiais', () => {
    const result = validatePhoneNumber('(11) 99988-7766')

    expect(result.isValid).toBe(true)
  })

  it('Deve lidar com country code diferente', () => {
    const result = validatePhoneNumber('999887766', 'AR')

    // Se for um número válido argentino
    if (result.isValid) {
      expect(result.country).toBe('AR')
    }
  })
})
