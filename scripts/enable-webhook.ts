/**
 * Script para habilitar e configurar o webhook global no UAZapi
 *
 * Uso: npx tsx scripts/enable-webhook.ts
 */

import 'dotenv/config'

async function enableGlobalWebhook() {
  const baseUrl = process.env.UAZAPI_BASE_URL || 'https://quayer.uazapi.com'
  const adminToken = process.env.UAZAPI_ADMIN_TOKEN

  if (!adminToken) {
    console.error('❌ UAZAPI_ADMIN_TOKEN não configurado no .env')
    process.exit(1)
  }

  console.log('🚀 Configurando webhook global no UAZapi...')
  console.log(`📍 Base URL: ${baseUrl}`)

  const webhookConfig = {
    url: 'https://app.quayer.com/api/v1/webhooks/uazapi',
    events: ['connection', 'messages', 'messages_update', 'chats'],
    excludeMessages: ['wasSentByApi'],
    addUrlEvents: false,
    addUrlTypesMessages: false,
    enabled: true,  // HABILITAR!
  }

  console.log('\n📋 Configuração a ser aplicada:')
  console.log(JSON.stringify(webhookConfig, null, 2))

  try {
    const response = await fetch(`${baseUrl}/globalwebhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'admintoken': adminToken,
      },
      body: JSON.stringify(webhookConfig),
    })

    if (!response.ok) {
      console.error(`❌ Erro HTTP ${response.status}: ${response.statusText}`)
      const error = await response.text()
      console.error('Resposta:', error)
      process.exit(1)
    }

    const data = await response.json()

    console.log('\n✅ Webhook global configurado e HABILITADO!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(JSON.stringify(data, null, 2))
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // Verificar configuração
    console.log('\n🔍 Verificando configuração aplicada...')
    const verifyResponse = await fetch(`${baseUrl}/globalwebhook`, {
      method: 'GET',
      headers: {
        'admintoken': adminToken,
      },
    })

    if (verifyResponse.ok) {
      const verifyData = await verifyResponse.json()
      console.log('\n📋 Configuração atual:')
      console.log(JSON.stringify(verifyData, null, 2))

      if (verifyData.enabled === true) {
        console.log('\n🎉 SUCESSO! Webhook está HABILITADO e pronto para receber eventos!')
      } else {
        console.log('\n⚠️  Webhook ainda está desabilitado. Verifique no painel UAZapi.')
      }
    }

  } catch (error: any) {
    console.error('❌ Erro ao configurar webhook:', error.message)
    process.exit(1)
  }
}

enableGlobalWebhook()
