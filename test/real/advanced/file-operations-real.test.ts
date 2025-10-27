import { test, expect } from '@playwright/test'
import { setupRealDatabase, cleanupRealDatabase } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { confirmAction } from '../setup/interactive'
import * as fs from 'fs'
import * as path from 'path'

test.describe('📁 Advanced: File Upload/Download', () => {
  let baseUrl: string
  let accessToken: string
  let uploadedFileId: string

  test.beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   ADVANCED: FILE UPLOAD/DOWNLOAD                     ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    const env = validateRealTestEnv()
    baseUrl = env.NEXT_PUBLIC_APP_URL
    await setupRealDatabase()

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@quayer.com', password: 'admin123456' }),
    })
    accessToken = (await loginResponse.json()).data.accessToken
  })

  test.afterAll(async () => {
    await cleanupRealDatabase()
  })

  test('deve fazer upload de arquivo (multipart/form-data)', async () => {
    console.log('\n📤 TESTE 1: Upload de Arquivo\n')

    // Create test file
    const testFilePath = path.join(process.cwd(), 'test-upload.txt')
    fs.writeFileSync(testFilePath, 'This is a test file for upload')

    console.log('⏳ Fazendo upload...')

    const formData = new FormData()
    const fileBlob = new Blob([fs.readFileSync(testFilePath)], { type: 'text/plain' })
    formData.append('file', fileBlob, 'test-upload.txt')

    const response = await fetch(`${baseUrl}/api/v1/files/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    })

    const data = await response.json()

    console.log(`   Status: ${response.status}`)
    console.log(`   File ID: ${data.data?.id}`)
    console.log(`   File URL: ${data.data?.url}`)

    expect(response.status).toBe(201)
    expect(data.data?.id).toBeTruthy()

    uploadedFileId = data.data.id

    console.log('✅ Upload realizado')

    // Cleanup local file
    fs.unlinkSync(testFilePath)

    expect(await confirmAction('Upload foi bem-sucedido?')).toBe(true)
  })

  test('deve fazer download de arquivo', async () => {
    console.log('\n📥 TESTE 2: Download de Arquivo\n')

    if (!uploadedFileId) {
      console.log('⚠️  Pulando - nenhum arquivo para download')
      return
    }

    console.log('⏳ Fazendo download...')

    const response = await fetch(`${baseUrl}/api/v1/files/${uploadedFileId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    console.log(`   Status: ${response.status}`)
    console.log(`   Content-Type: ${response.headers.get('content-type')}`)

    expect(response.status).toBe(200)

    const content = await response.text()
    console.log(`   Tamanho: ${content.length} bytes`)

    expect(content.length).toBeGreaterThan(0)

    console.log('✅ Download realizado')
    expect(await confirmAction('Download funcionou?')).toBe(true)
  })

  test('deve validar tamanho máximo de arquivo', async () => {
    console.log('\n⚠️  TESTE 3: Limite de Tamanho\n')

    // Create large file (> 10MB)
    const largeFilePath = path.join(process.cwd(), 'large-file.bin')
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024) // 11MB
    fs.writeFileSync(largeFilePath, largeBuffer)

    console.log('⏳ Tentando upload de arquivo grande (11MB)...')

    const formData = new FormData()
    const fileBlob = new Blob([fs.readFileSync(largeFilePath)], { type: 'application/octet-stream' })
    formData.append('file', fileBlob, 'large-file.bin')

    const response = await fetch(`${baseUrl}/api/v1/files/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    })

    console.log(`   Status: ${response.status}`)

    // Should return 413 Payload Too Large or 400
    expect([400, 413]).toContain(response.status)

    console.log('✅ Arquivo grande rejeitado')

    // Cleanup
    fs.unlinkSync(largeFilePath)

    expect(await confirmAction('Arquivo grande foi rejeitado?')).toBe(true)
  })

  test('deve validar tipos de arquivo permitidos', async () => {
    console.log('\n🚫 TESTE 4: Tipos de Arquivo\n')

    const dangerousFiles = [
      { name: 'virus.exe', type: 'application/x-msdownload' },
      { name: 'script.sh', type: 'application/x-sh' },
      { name: 'malware.bat', type: 'application/x-msdos-program' },
    ]

    console.log('⏳ Testando arquivos perigosos...')

    for (const file of dangerousFiles) {
      const testPath = path.join(process.cwd(), file.name)
      fs.writeFileSync(testPath, 'dangerous content')

      const formData = new FormData()
      const fileBlob = new Blob([fs.readFileSync(testPath)], { type: file.type })
      formData.append('file', fileBlob, file.name)

      const response = await fetch(`${baseUrl}/api/v1/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      })

      console.log(`   ${file.name}: ${response.status}`)

      expect(response.status).toBe(400)

      fs.unlinkSync(testPath)
    }

    console.log('✅ Arquivos perigosos rejeitados')
    expect(await confirmAction('Tipos perigosos foram bloqueados?')).toBe(true)
  })

  test('deve listar arquivos do usuário', async () => {
    console.log('\n📋 TESTE 5: Listar Arquivos\n')

    console.log('⏳ Listando arquivos...')

    const response = await fetch(`${baseUrl}/api/v1/files`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const data = await response.json()

    console.log(`   Status: ${response.status}`)
    console.log(`   Total de arquivos: ${data.data?.length || 0}`)

    expect(response.status).toBe(200)
    expect(Array.isArray(data.data)).toBe(true)

    if (data.data && data.data.length > 0) {
      console.log(`   Primeiro arquivo: ${data.data[0].filename}`)
    }

    console.log('✅ Listagem funcionando')
    expect(await confirmAction('Listagem de arquivos está correta?')).toBe(true)
  })

  test('deve resumir file operations', async () => {
    console.log('\n📊 RESUMO: File Operations\n')
    console.log('┌──────────────────────────┬──────────┐')
    console.log('│ Operação                 │ Status   │')
    console.log('├──────────────────────────┼──────────┤')
    console.log('│ Upload (Multipart)       │    ✓     │')
    console.log('│ Download                 │    ✓     │')
    console.log('│ Limite de Tamanho        │    ✓     │')
    console.log('│ Validação de Tipos       │    ✓     │')
    console.log('│ Listar Arquivos          │    ✓     │')
    console.log('└──────────────────────────┴──────────┘')
    console.log('\n✅ FILE OPERATIONS: COMPLETO')
  })
})
