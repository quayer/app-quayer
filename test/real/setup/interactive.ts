import readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

/**
 * Faz uma pergunta ao usuário e aguarda resposta
 */
export function askUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`\n${question}\n> `, (answer) => {
      resolve(answer.trim())
    })
  })
}

/**
 * Aguarda usuário pressionar ENTER
 */
export async function waitForUserAction(message: string): Promise<void> {
  console.log(`\n⏸️  ${message}`)
  await new Promise<void>((resolve) => {
    rl.question('Pressione ENTER quando estiver pronto...', () => {
      resolve()
    })
  })
}

/**
 * Pergunta sim/não ao usuário
 */
export async function confirmAction(message: string): Promise<boolean> {
  const answer = await askUser(`${message} (s/n)`)
  return answer.toLowerCase() === 's' || answer.toLowerCase() === 'sim' || answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'
}

/**
 * Solicita email ao usuário com validação básica
 */
export async function askEmail(prompt: string = 'Digite um email válido:'): Promise<string> {
  const email = await askUser(prompt)

  // Validação básica de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    console.log('❌ Email inválido. Tente novamente.')
    return askEmail(prompt)
  }

  return email
}

/**
 * Solicita código OTP (6 dígitos)
 */
export async function askOTP(prompt: string = 'Digite o código OTP (6 dígitos):'): Promise<string> {
  const otp = await askUser(prompt)

  // Validação: 6 dígitos
  if (!/^\d{6}$/.test(otp)) {
    console.log('❌ OTP deve ter 6 dígitos. Tente novamente.')
    return askOTP(prompt)
  }

  return otp
}

/**
 * Solicita número de telefone
 */
export async function askPhoneNumber(prompt: string = 'Digite o número com DDI (ex: 5511999999999):'): Promise<string> {
  const phone = await askUser(prompt)

  // Validação básica: apenas números, mínimo 10 dígitos
  if (!/^\d{10,}$/.test(phone)) {
    console.log('❌ Número inválido. Use apenas números com DDI. Tente novamente.')
    return askPhoneNumber(prompt)
  }

  return phone
}

/**
 * Mostra QR Code ASCII art formatado
 */
export function displayQRCode(qrCode: string): void {
  console.log('\n' + '═'.repeat(60))
  console.log('📱 QR CODE PARA ESCANEAR COM WHATSAPP')
  console.log('═'.repeat(60))
  console.log(qrCode)
  console.log('═'.repeat(60) + '\n')
}

/**
 * Exibe progresso com animação
 */
export async function showProgress(message: string, durationMs: number): Promise<void> {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let frameIndex = 0

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      process.stdout.write(`\r${frames[frameIndex]} ${message}`)
      frameIndex = (frameIndex + 1) % frames.length
    }, 80)

    setTimeout(() => {
      clearInterval(interval)
      process.stdout.write('\r' + ' '.repeat(message.length + 3) + '\r')
      resolve()
    }, durationMs)
  })
}

/**
 * Fecha o readline interface
 */
export function closeInteractive(): void {
  rl.close()
}

/**
 * Mostra menu de opções e retorna escolha
 */
export async function showMenu(title: string, options: string[]): Promise<number> {
  console.log(`\n${title}`)
  console.log('─'.repeat(50))
  options.forEach((option, index) => {
    console.log(`${index + 1}. ${option}`)
  })
  console.log('─'.repeat(50))

  const choice = await askUser('Escolha uma opção:')
  const num = parseInt(choice)

  if (isNaN(num) || num < 1 || num > options.length) {
    console.log('❌ Opção inválida. Tente novamente.')
    return showMenu(title, options)
  }

  return num
}
