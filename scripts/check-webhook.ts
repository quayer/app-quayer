/**
 * Script para verificar configuração do webhook global no UAZapi
 *
 * Uso: npx tsx scripts/check-webhook.ts
 */

import 'dotenv/config'

async function checkGlobalWebhook() {
  const baseUrl = process.env.UAZAPI_BASE_URL || 'https://quayer.uazapi.com'
  const adminToken = process.env.UAZAPI_ADMIN_TOKEN

  if (!adminToken) {
    console.error('❌ UAZAPI_ADMIN_TOKEN não configurado no .env')
    process.exit(1)
  }

  console.log('🔍 Verificando webhook global no UAZapi...')
  console.log(`📍 Base URL: ${baseUrl}`)

  try {
    const response = await fetch(`${baseUrl}/globalwebhook`, {
      method: 'GET',
      headers: {
        'admintoken': adminToken,
      },
    })

    if (!response.ok) {
      console.error(`❌ Erro HTTP ${response.status}: ${response.statusText}`)
      const error = await response.text()
      console.error('Resposta:', error)
      process.exit(1)
    }

    const data = await response.json()

    console.log('\n✅ Webhook global configurado!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(JSON.stringify(data, null, 2))
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // Verificar se URL está correta
    const webhookUrl = data.url || data.webhook?.url
    if (webhookUrl) {
      if (webhookUrl.includes('app.quayer.com')) {
        console.log('\n✅ URL do webhook está correta!')
      } else {
        console.log(`\n⚠️  URL do webhook pode estar incorreta: ${webhookUrl}`)
        console.log('   Esperado: https://app.quayer.com/api/v1/webhooks/uazapi')
      }
    } else {
      console.log('\n❌ Nenhuma URL configurada no webhook!')
    }

  } catch (error: any) {
    console.error('❌ Erro ao verificar webhook:', error.message)
    process.exit(1)
  }
}

checkGlobalWebhook()
