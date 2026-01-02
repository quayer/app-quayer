/**
 * Script de teste para API de foto de perfil
 *
 * Testa:
 * 1. Backend: GET /api/v1/contacts/profile-picture
 * 2. UAZapi: GET /profile/image/:phoneNumber
 * 3. Database: Contact.profilePicUrl
 *
 * Uso: npx ts-node scripts/test-profile-picture.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Configuração
const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'
const API_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface TestResult {
  test: string
  status: 'pass' | 'fail' | 'skip'
  message: string
  data?: any
}

const results: TestResult[] = []

function log(message: string, data?: any) {
  console.log(`[TEST] ${message}`)
  if (data) {
    console.log(JSON.stringify(data, null, 2))
  }
}

function addResult(test: string, status: 'pass' | 'fail' | 'skip', message: string, data?: any) {
  results.push({ test, status, message, data })
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️'
  console.log(`${icon} ${test}: ${message}`)
}

async function testDatabaseContacts() {
  log('=== Teste 1: Verificar contatos no banco de dados ===')

  try {
    // Buscar contatos com foto de perfil
    const contactsWithPic = await prisma.contact.findMany({
      where: { profilePicUrl: { not: null } },
      take: 5,
      select: { id: true, phoneNumber: true, name: true, profilePicUrl: true }
    })

    // Buscar contatos sem foto de perfil
    const contactsWithoutPic = await prisma.contact.findMany({
      where: { profilePicUrl: null },
      take: 5,
      select: { id: true, phoneNumber: true, name: true }
    })

    // Contar totais
    const totalWithPic = await prisma.contact.count({ where: { profilePicUrl: { not: null } } })
    const totalWithoutPic = await prisma.contact.count({ where: { profilePicUrl: null } })

    addResult(
      'Database: Contatos',
      'pass',
      `${totalWithPic} com foto, ${totalWithoutPic} sem foto`,
      {
        withPic: contactsWithPic.map(c => ({ phone: c.phoneNumber, name: c.name, hasUrl: !!c.profilePicUrl })),
        withoutPic: contactsWithoutPic.map(c => ({ phone: c.phoneNumber, name: c.name }))
      }
    )

    return { contactsWithPic, contactsWithoutPic }
  } catch (error: any) {
    addResult('Database: Contatos', 'fail', error.message)
    return { contactsWithPic: [], contactsWithoutPic: [] }
  }
}

async function testDatabaseConnections() {
  log('=== Teste 2: Verificar conexões no banco de dados ===')

  try {
    const connections = await prisma.connection.findMany({
      where: { status: 'CONNECTED' },
      select: {
        id: true,
        name: true,
        status: true,
        provider: true,
        uazapiToken: true
      }
    })

    const connectedWithToken = connections.filter(c => c.uazapiToken)

    addResult(
      'Database: Conexões',
      connectedWithToken.length > 0 ? 'pass' : 'fail',
      `${connectedWithToken.length} conexões conectadas com token`,
      connections.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        provider: c.provider,
        hasToken: !!c.uazapiToken
      }))
    )

    return connections
  } catch (error: any) {
    addResult('Database: Conexões', 'fail', error.message)
    return []
  }
}

async function testUazapiDirectly(token: string, phoneNumber: string) {
  log(`=== Teste 3: UAZapi diretamente para ${phoneNumber} ===`)

  try {
    const cleanNumber = phoneNumber.replace(/@.*$/, '')
    const url = `${UAZAPI_URL}/profile/image/${cleanNumber}`

    log(`Chamando: GET ${url}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'token': token,
      },
    })

    const status = response.status
    const data = await response.json().catch(() => null)

    if (response.ok && data) {
      const picUrl = data.profilePicUrl || data.url || data.data?.url
      addResult(
        'UAZapi: Foto de perfil',
        picUrl ? 'pass' : 'fail',
        picUrl ? `URL obtida: ${picUrl.substring(0, 50)}...` : 'Resposta sem URL',
        { status, hasUrl: !!picUrl, responseKeys: Object.keys(data || {}) }
      )
      return picUrl
    } else {
      addResult(
        'UAZapi: Foto de perfil',
        'fail',
        `HTTP ${status}: ${data?.message || 'Erro desconhecido'}`,
        { status, data }
      )
      return null
    }
  } catch (error: any) {
    addResult('UAZapi: Foto de perfil', 'fail', error.message)
    return null
  }
}

async function testBackendAPI(instanceId: string, phoneNumber: string) {
  log(`=== Teste 4: Backend API para ${phoneNumber} ===`)

  try {
    const cleanNumber = phoneNumber.replace(/@.*$/, '')
    const url = `${API_BASE_URL}/api/v1/contacts/profile-picture?instanceId=${instanceId}&phoneNumber=${cleanNumber}`

    log(`Chamando: GET ${url}`)

    // Nota: Esta chamada não vai funcionar diretamente porque precisa de autenticação
    // Mas podemos verificar se a rota existe
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const status = response.status
    const data = await response.json().catch(() => null)

    // 401 é esperado sem autenticação
    if (status === 401) {
      addResult(
        'Backend API: Rota existe',
        'pass',
        'Rota existe (401 = requer autenticação)',
        { status }
      )
    } else if (response.ok) {
      addResult(
        'Backend API: Foto de perfil',
        'pass',
        `Resposta: ${JSON.stringify(data).substring(0, 100)}`,
        { status, data }
      )
    } else {
      addResult(
        'Backend API: Foto de perfil',
        'fail',
        `HTTP ${status}`,
        { status, data }
      )
    }
  } catch (error: any) {
    // Se der erro de conexão, o servidor pode não estar rodando
    if (error.code === 'ECONNREFUSED') {
      addResult('Backend API', 'skip', 'Servidor não está rodando (ECONNREFUSED)')
    } else {
      addResult('Backend API', 'fail', error.message)
    }
  }
}

async function testImageUrlAccessibility(url: string) {
  log(`=== Teste 5: Acessibilidade da URL da imagem ===`)

  if (!url) {
    addResult('Image URL', 'skip', 'Nenhuma URL para testar')
    return
  }

  try {
    const response = await fetch(url, { method: 'HEAD' })

    if (response.ok) {
      const contentType = response.headers.get('content-type')
      addResult(
        'Image URL: Acessível',
        'pass',
        `Content-Type: ${contentType}`,
        { status: response.status, contentType }
      )
    } else {
      addResult(
        'Image URL: Acessível',
        'fail',
        `HTTP ${response.status}`,
        { status: response.status }
      )
    }
  } catch (error: any) {
    addResult('Image URL: Acessível', 'fail', error.message)
  }
}

async function analyzePhoneNumberFormats() {
  log('=== Teste 6: Análise de formatos de phoneNumber ===')

  try {
    const samples = await prisma.contact.findMany({
      take: 20,
      select: { phoneNumber: true }
    })

    const formats: Record<string, number> = {}

    for (const { phoneNumber } of samples) {
      let format = 'unknown'
      if (phoneNumber.endsWith('@s.whatsapp.net')) {
        format = 'with @s.whatsapp.net'
      } else if (phoneNumber.endsWith('@g.us')) {
        format = 'group @g.us'
      } else if (/^\d+$/.test(phoneNumber)) {
        format = 'numbers only'
      } else if (phoneNumber.includes('@')) {
        format = 'other @ format'
      }
      formats[format] = (formats[format] || 0) + 1
    }

    addResult(
      'PhoneNumber Formats',
      'pass',
      `Analisados ${samples.length} contatos`,
      { formats, samples: samples.slice(0, 5).map(s => s.phoneNumber) }
    )
  } catch (error: any) {
    addResult('PhoneNumber Formats', 'fail', error.message)
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║     TESTE DE API DE FOTO DE PERFIL - PROFILE PICTURE       ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`UAZAPI_URL: ${UAZAPI_URL}`)
  console.log(`API_BASE_URL: ${API_BASE_URL}`)
  console.log('')

  try {
    // Teste 1: Database - Contatos
    const { contactsWithoutPic } = await testDatabaseContacts()
    console.log('')

    // Teste 2: Database - Conexões
    const connections = await testDatabaseConnections()
    console.log('')

    // Teste 3 & 4: Se temos conexão e contato, testar API
    const connectedInstance = connections.find(c => c.uazapiToken && c.status === 'CONNECTED')
    const testContact = contactsWithoutPic[0]

    if (connectedInstance && testContact) {
      // Teste 3: UAZapi diretamente
      const picUrl = await testUazapiDirectly(
        connectedInstance.uazapiToken!,
        testContact.phoneNumber
      )
      console.log('')

      // Teste 4: Backend API
      await testBackendAPI(connectedInstance.id, testContact.phoneNumber)
      console.log('')

      // Teste 5: Acessibilidade da imagem
      if (picUrl) {
        await testImageUrlAccessibility(picUrl)
        console.log('')
      }
    } else {
      addResult('API Tests', 'skip', 'Sem conexão ou contato disponível para teste')
      console.log('')
    }

    // Teste 6: Análise de formatos
    await analyzePhoneNumberFormats()
    console.log('')

    // Resumo
    console.log('╔════════════════════════════════════════════════════════════╗')
    console.log('║                        RESUMO                              ║')
    console.log('╚════════════════════════════════════════════════════════════╝')

    const passed = results.filter(r => r.status === 'pass').length
    const failed = results.filter(r => r.status === 'fail').length
    const skipped = results.filter(r => r.status === 'skip').length

    console.log(`✅ Passou: ${passed}`)
    console.log(`❌ Falhou: ${failed}`)
    console.log(`⏭️ Pulado: ${skipped}`)
    console.log('')

    if (failed > 0) {
      console.log('Falhas:')
      results.filter(r => r.status === 'fail').forEach(r => {
        console.log(`  - ${r.test}: ${r.message}`)
      })
    }

  } catch (error) {
    console.error('Erro fatal:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
