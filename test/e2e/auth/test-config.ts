/**
 * ============================================================
 * CONFIGURACAO DE TESTES E2E - PRODUCAO
 * ============================================================
 *
 * Emails disponiveis para testes (contas reais):
 * - contato.gabrielrizzatto@gmail.com
 * - gabrielrizzatto@hotmail.com
 * - mart.gabrielrizzatto@gmail.com
 * - nicolauamanda3@gmail.com
 *
 * IMPORTANTE: Se precisar reutilizar email, excluir organizacao primeiro
 */

export const TEST_CONFIG = {
  // URL de producao
  baseUrl: 'https://app.quayer.com',

  // Emails de teste disponiveis
  testEmails: {
    // Email principal para testes de login
    primary: 'contato.gabrielrizzatto@gmail.com',

    // Emails alternativos
    secondary: 'gabrielrizzatto@hotmail.com',
    tertiary: 'mart.gabrielrizzatto@gmail.com',
    quaternary: 'nicolauamanda3@gmail.com',
  },

  // Alocacao de emails por cenario
  // IMPORTANTE: Se email ja tem conta, excluir organizacao antes de testar
  scenarios: {
    // Signup PF - usar email que NAO tem conta
    signupPF: 'mart.gabrielrizzatto@gmail.com',

    // Signup PJ - usar email que NAO tem conta
    signupPJ: 'nicolauamanda3@gmail.com',

    // Login OTP - usar email que JA TEM conta
    loginOTP: 'contato.gabrielrizzatto@gmail.com',

    // Convite equipe - admin que convida
    inviteAdmin: 'contato.gabrielrizzatto@gmail.com',

    // Convite equipe - email do convidado
    inviteMember: 'gabrielrizzatto@hotmail.com',
  },

  // Timeouts (em ms)
  timeouts: {
    pageLoad: 10000,
    otp: 180000, // 3 minutos para inserir OTP
    navigation: 30000,
    action: 5000,
  },
}

// Helper para obter email do cenario
export function getTestEmail(scenario: keyof typeof TEST_CONFIG.scenarios): string {
  return TEST_CONFIG.scenarios[scenario]
}

// Helper para log de configuracao
export function logTestConfig() {
  console.log('\n' + '='.repeat(60))
  console.log('📋 CONFIGURACAO DE TESTE')
  console.log('='.repeat(60))
  console.log(`🌐 URL: ${TEST_CONFIG.baseUrl}`)
  console.log('📧 Emails alocados:')
  Object.entries(TEST_CONFIG.scenarios).forEach(([scenario, email]) => {
    console.log(`   ${scenario}: ${email}`)
  })
  console.log('='.repeat(60) + '\n')
}
