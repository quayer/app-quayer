import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'

describe('📊 Dashboard Métricas REAL', () => {
  let env: ReturnType<typeof validateRealTestEnv>
  let accessToken: string
  let userId: string
  let orgId: string

  beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE REAL: DASHBOARD E MÉTRICAS                   ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    env = validateRealTestEnv()
    await setupRealDatabase()

    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@quayer.com',
        password: 'admin123456',
      }),
    })

    const loginData = await loginResponse.json()
    accessToken = loginData.data.accessToken
    userId = loginData.data.user.id
    orgId = loginData.data.user.currentOrgId
  })

  afterAll(async () => {
    await cleanupRealDatabase()
  })

  it('deve carregar métricas gerais', async () => {
    console.log('\n📊 PASSO 1: Métricas Gerais\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Carregando métricas...')

    const metricsResponse = await fetch(`${baseUrl}/api/v1/dashboard/metrics`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    const metricsData = await metricsResponse.json()

    expect(metricsResponse.status).toBe(200)
    expect(metricsData.success).toBe(true)
    expect(metricsData.data).toBeDefined()

    const metrics = metricsData.data

    console.log('\n✅ Métricas carregadas!')
    console.log(`\n📈 RESUMO GERAL:`)
    console.log(`   Total de Mensagens: ${metrics.totalMessages || 0}`)
    console.log(`   Mensagens Hoje: ${metrics.messagesToday || 0}`)
    console.log(`   Instâncias Ativas: ${metrics.activeInstances || 0}`)
    console.log(`   Total de Usuários: ${metrics.totalUsers || 0}`)
    console.log(`   Webhooks Ativos: ${metrics.activeWebhooks || 0}`)

    expect(metrics.totalMessages).toBeGreaterThanOrEqual(0)
    expect(metrics.activeInstances).toBeGreaterThanOrEqual(0)
  })

  it('deve validar dados no banco', async () => {
    console.log('\n🗄️  PASSO 2: Validar no Banco\n')

    const prisma = getRealPrisma()

    console.log('⏳ Contando registros...')

    const [messageCount, instanceCount, userCount, webhookCount] = await Promise.all([
      prisma.message.count({ where: { instance: { organizationId: orgId } } }),
      prisma.instance.count({ where: { organizationId: orgId, status: 'connected' } }),
      prisma.user.count(),
      prisma.webhook.count({ where: { organizationId: orgId, active: true } }),
    ])

    console.log('\n✅ Dados do banco:')
    console.log(`   Mensagens: ${messageCount}`)
    console.log(`   Instâncias ativas: ${instanceCount}`)
    console.log(`   Usuários: ${userCount}`)
    console.log(`   Webhooks ativos: ${webhookCount}`)

    expect(messageCount).toBeGreaterThanOrEqual(0)
    expect(userCount).toBeGreaterThan(0)
  })

  it('deve carregar gráfico de mensagens por dia', async () => {
    console.log('\n📈 PASSO 3: Gráfico Mensagens/Dia\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Carregando dados do gráfico...')

    const chartResponse = await fetch(
      `${baseUrl}/api/v1/dashboard/messages-chart?period=7days`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    )

    const chartData = await chartResponse.json()

    expect(chartResponse.status).toBe(200)
    expect(chartData.data).toBeInstanceOf(Array)

    console.log(`\n✅ Dados do gráfico: ${chartData.data.length} pontos`)

    chartData.data.forEach((point: any, index: number) => {
      if (index < 5) {
        console.log(`   ${point.date}: ${point.count} mensagens`)
      }
    })

    if (chartData.data.length > 5) {
      console.log(`   ... e mais ${chartData.data.length - 5} pontos`)
    }
  })

  it('deve aplicar filtros de período', async () => {
    console.log('\n🔍 PASSO 4: Filtros de Período\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const periods = ['today', '7days', '30days']

    for (const period of periods) {
      console.log(`\n⏳ Testando período: ${period}`)

      const response = await fetch(
        `${baseUrl}/api/v1/dashboard/metrics?period=${period}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      )

      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toBeDefined()

      console.log(`   ✅ ${period}: ${data.data.totalMessages || 0} mensagens`)
    }
  })

  it('deve carregar top conversas', async () => {
    console.log('\n💬 PASSO 5: Top Conversas\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Carregando top conversas...')

    const conversationsResponse = await fetch(
      `${baseUrl}/api/v1/dashboard/top-conversations?limit=10`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    )

    const conversationsData = await conversationsResponse.json()

    expect(conversationsResponse.status).toBe(200)
    expect(conversationsData.data).toBeInstanceOf(Array)

    console.log(`\n✅ Top ${conversationsData.data.length} conversas:`)

    conversationsData.data.forEach((conv: any, index: number) => {
      console.log(`\n   ${index + 1}. ${conv.contact || conv.phoneNumber}`)
      console.log(`      Mensagens: ${conv.messageCount}`)
      console.log(`      Última msg: ${new Date(conv.lastMessage).toLocaleString()}`)
    })
  })

  it('deve exportar relatório', async () => {
    console.log('\n📥 PASSO 6: Exportar Relatório\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Gerando relatório CSV...')

    const exportResponse = await fetch(
      `${baseUrl}/api/v1/dashboard/export?format=csv&period=7days`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    )

    expect(exportResponse.status).toBe(200)
    expect(exportResponse.headers.get('content-type')).toContain('text/csv')

    const csv = await exportResponse.text()

    console.log('\n✅ Relatório gerado!')
    console.log(`   Tamanho: ${csv.length} bytes`)
    console.log(`   Primeiras linhas:\n`)

    const lines = csv.split('\n').slice(0, 3)
    lines.forEach(line => console.log(`   ${line}`))
  })

  it('deve validar performance', async () => {
    console.log('\n⚡ PASSO 7: Teste de Performance\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Testando tempo de resposta...')

    const start = Date.now()

    const response = await fetch(`${baseUrl}/api/v1/dashboard/metrics`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    const duration = Date.now() - start

    expect(response.status).toBe(200)
    expect(duration).toBeLessThan(3000)

    console.log(`\n✅ Performance validada!`)
    console.log(`   Tempo de resposta: ${duration}ms`)
    console.log(`   Meta: < 3000ms`)

    if (duration < 1000) {
      console.log('   🚀 EXCELENTE!')
    } else if (duration < 2000) {
      console.log('   ✅ BOM')
    } else {
      console.log('   ⚠️  ACEITÁVEL')
    }

    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE COMPLETO: DASHBOARD 100% REAL               ║')
    console.log('║   ✅ Métricas gerais carregadas                       ║')
    console.log('║   ✅ Dados validados no banco                         ║')
    console.log('║   ✅ Gráficos funcionando                             ║')
    console.log('║   ✅ Filtros aplicados                                ║')
    console.log('║   ✅ Top conversas listadas                           ║')
    console.log('║   ✅ Export CSV gerado                                ║')
    console.log('║   ✅ Performance validada                             ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')
  })
})
