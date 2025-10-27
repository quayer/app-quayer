import dotenv from 'dotenv'
import { z } from 'zod'
import path from 'path'

// Carregar .env do root do projeto
dotenv.config({ path: path.join(process.cwd(), '.env') })

const RealTestEnvSchema = z.object({
  // Database (obrigatório)
  DATABASE_URL: z.string().url('DATABASE_URL deve ser uma URL válida'),

  // Server
  PORT: z.string().transform(Number).default('3000'),
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL deve ser uma URL válida'),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),

  // Email (obrigatório para testes de auth)
  EMAIL_PROVIDER: z.enum(['smtp', 'resend', 'mock']),
  EMAIL_FROM: z.string().email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASS: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  // WhatsApp (obrigatório para testes de integração)
  UAZAPI_URL: z.string().url('UAZAPI_URL deve ser uma URL válida'),
  UAZAPI_ADMIN_TOKEN: z.string().min(10, 'UAZAPI_ADMIN_TOKEN deve ter no mínimo 10 caracteres'),

  // Opcional mas recomendado
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
})

export type RealTestEnv = z.infer<typeof RealTestEnvSchema>

export function validateRealTestEnv(): RealTestEnv {
  console.log('🔍 Validando variáveis de ambiente para testes REAIS...\n')

  const result = RealTestEnvSchema.safeParse(process.env)

  if (!result.success) {
    console.error('❌ Variáveis de ambiente faltando ou inválidas:\n')

    const errors = result.error.format()
    Object.entries(errors).forEach(([key, value]) => {
      if (key !== '_errors' && value) {
        const error = value as any
        if (error._errors && error._errors.length > 0) {
          console.error(`   ${key}: ${error._errors[0]}`)
        }
      }
    })

    console.log('\n📝 Configure seu .env com as variáveis necessárias:')
    console.log('─'.repeat(50))
    console.log('DATABASE_URL=postgresql://docker:docker@localhost:5432/docker')
    console.log('NEXT_PUBLIC_APP_URL=http://localhost:3000')
    console.log('JWT_SECRET=your_secret_min_32_characters_here')
    console.log('EMAIL_PROVIDER=mock')
    console.log('UAZAPI_URL=https://quayer.uazapi.com')
    console.log('UAZAPI_ADMIN_TOKEN=your_token_here')
    console.log('─'.repeat(50))
    console.log('\n💡 Dica: Copie .env.example e ajuste os valores')

    process.exit(1)
  }

  console.log('✅ Todas as variáveis de ambiente validadas!')
  console.log(`📍 Base URL: ${result.data.NEXT_PUBLIC_APP_URL}`)
  console.log(`📍 Porta: ${result.data.PORT}`)
  console.log(`📧 Email: ${result.data.EMAIL_PROVIDER}`)
  console.log(`📱 WhatsApp: ${result.data.UAZAPI_URL}`)
  console.log('')

  return result.data
}
