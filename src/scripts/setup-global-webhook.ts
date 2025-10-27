/**
 * Setup Global Webhook Script
 *
 * Configura o webhook global no uazapi para receber eventos de todas as instâncias.
 * Este script deve ser executado uma vez durante o deploy ou quando o endpoint mudar.
 *
 * Eventos configurados:
 * - messages: Novas mensagens recebidas
 * - messages_update: Atualizações de status de mensagens
 * - connection: Eventos de conexão/desconexão
 *
 * Exclusão configurada:
 * - wasSentByApi: true (evita loops de mensagens enviadas pela API)
 *
 * @example
 * ```bash
 * npm run setup:webhook
 * ```
 */

import 'dotenv/config'

interface GlobalWebhookConfig {
  url: string
  events: string[]
  excludeMessages?: {
    wasSentByApi?: boolean
  }
}

interface GlobalWebhookResponse {
  success: boolean
  url: string
  events: string[]
  excludeMessages?: {
    wasSentByApi?: boolean
  }
}

/**
 * Configurar webhook global no uazapi
 */
async function setupGlobalWebhook(): Promise<void> {
  console.log('🚀 Iniciando configuração de webhook global...\n')

  // Validar variáveis de ambiente
  const adminToken = process.env.UAZAPI_ADMIN_TOKEN
  const webhookUrl = process.env.UAZAPI_WEBHOOK_URL
  const uazapiBaseUrl = process.env.UAZAPI_BASE_URL || 'https://api.uazapi.com'

  if (!adminToken) {
    throw new Error('❌ UAZAPI_ADMIN_TOKEN não configurado no .env')
  }

  if (!webhookUrl) {
    throw new Error('❌ UAZAPI_WEBHOOK_URL não configurado no .env')
  }

  console.log('✅ Variáveis de ambiente validadas')
  console.log(`📍 Base URL: ${uazapiBaseUrl}`)
  console.log(`📍 Webhook URL: ${webhookUrl}\n`)

  // Configuração do webhook
  const config: GlobalWebhookConfig = {
    url: webhookUrl,
    events: ['messages', 'messages_update', 'connection'],
    excludeMessages: {
      wasSentByApi: true, // Evitar loops de mensagens enviadas pela API
    },
  }

  try {
    console.log('📡 Enviando configuração para uazapi...')
    console.log('Payload:', JSON.stringify(config, null, 2))

    const response = await fetch(`${uazapiBaseUrl}/globalwebhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(config),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
      throw new Error(
        `Erro ao configurar webhook: ${response.status} ${response.statusText}\n${JSON.stringify(error, null, 2)}`
      )
    }

    const result: GlobalWebhookResponse = await response.json()

    console.log('\n✅ Webhook global configurado com sucesso!')
    console.log('📋 Configuração aplicada:')
    console.log(`   URL: ${result.url}`)
    console.log(`   Eventos: ${result.events.join(', ')}`)
    if (result.excludeMessages) {
      console.log(`   Excluir wasSentByApi: ${result.excludeMessages.wasSentByApi}`)
    }

    // Verificar configuração atual
    console.log('\n🔍 Verificando configuração atual...')
    const verifyResponse = await fetch(`${uazapiBaseUrl}/globalwebhook`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })

    if (verifyResponse.ok) {
      const currentConfig = await verifyResponse.json()
      console.log('✅ Configuração confirmada:')
      console.log(JSON.stringify(currentConfig, null, 2))
    } else {
      console.warn('⚠️  Não foi possível verificar a configuração')
    }

    console.log('\n🎉 Setup concluído com sucesso!')
  } catch (error) {
    console.error('\n❌ Erro durante configuração:')
    console.error(error)
    process.exit(1)
  }
}

/**
 * Remover webhook global (útil para testes)
 */
async function removeGlobalWebhook(): Promise<void> {
  console.log('🗑️  Removendo webhook global...\n')

  const adminToken = process.env.UAZAPI_ADMIN_TOKEN
  const uazapiBaseUrl = process.env.UAZAPI_BASE_URL || 'https://api.uazapi.com'

  if (!adminToken) {
    throw new Error('❌ UAZAPI_ADMIN_TOKEN não configurado no .env')
  }

  try {
    const response = await fetch(`${uazapiBaseUrl}/globalwebhook`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Erro ao remover webhook: ${response.status} ${response.statusText}`)
    }

    console.log('✅ Webhook global removido com sucesso!')
  } catch (error) {
    console.error('\n❌ Erro ao remover webhook:')
    console.error(error)
    process.exit(1)
  }
}

/**
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  switch (command) {
    case 'remove':
      await removeGlobalWebhook()
      break
    case 'setup':
    default:
      await setupGlobalWebhook()
      break
  }
}

// Execute
main()
