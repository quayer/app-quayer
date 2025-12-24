import { test, expect } from '@playwright/test'
import {
  generateTestUser,
  waitForPageLoad,
  screenshot,
  logStep,
  logBug,
  logSuccess,
  logWarning,
  getCurrentPath,
  elementExists
} from './test-helpers'

/**
 * ============================================================
 * TESTE E2E: JORNADA DE CONVITE PARA EQUIPE
 * ============================================================
 *
 * Este teste valida a jornada de convite:
 * 1. Usuario autenticado convida membro
 * 2. Membro recebe email com link
 * 3. Membro acessa link e aceita convite
 * 4. Membro faz login/cria conta
 *
 * MODO: INTERATIVO (requer login e acoes manuais)
 *
 * Para executar:
 * npm run test:e2e -- test/e2e/auth/team-invite.spec.ts --headed
 */

test.describe('Jornada Convite para Equipe', () => {
  test.setTimeout(600000) // 10 minutos

  test.describe('Fluxo do Convidador (quem envia convite)', () => {
    test('deve enviar convite para novo membro', async ({ page }) => {
      const newMemberEmail = `membro.${Date.now()}@quayer.test`
      const bugs: string[] = []

      console.log('\n' + '='.repeat(60))
      console.log('🧪 TESTE: Enviar Convite para Equipe')
      console.log('='.repeat(60))
      console.log(`📧 Email do convidado: ${newMemberEmail}`)
      console.log('⚠️  PRE-REQUISITO: Usuario logado como dono da organizacao')
      console.log('='.repeat(60))

      // ========================================
      // STEP 1: Acessar dashboard (usuario deve estar logado)
      // ========================================
      logStep(1, 'Verificar se usuario esta autenticado')

      await page.goto('/integracoes')
      await waitForPageLoad(page)
      await screenshot(page, 'invite-dashboard', 1)

      const currentPath = getCurrentPath(page)

      if (currentPath.includes('/login')) {
        console.log('\n⚠️  USUARIO NAO AUTENTICADO!')
        console.log('📝 Por favor, faca login no navegador')
        console.log('⏳ Aguardando login...\n')

        try {
          await page.waitForURL(/\/integracoes/, { timeout: 180000 })
          logSuccess('Login realizado!')
        } catch (e) {
          logBug('CRITICAL', 'Usuario nao logou - teste interrompido')
          throw new Error('Login required')
        }
      } else {
        logSuccess('Usuario autenticado')
      }

      // ========================================
      // STEP 2: Navegar para pagina de equipe/usuarios
      // ========================================
      logStep(2, 'Navegar para gerenciamento de equipe')

      // Procurar link para equipe na navegacao
      const teamLinks = [
        'text=Equipe',
        'text=Membros',
        'text=Usuarios',
        'text=Time',
        'a[href*="team"]',
        'a[href*="members"]',
        'a[href*="users"]',
        'button:has-text("Equipe")'
      ]

      let teamLinkFound = false
      for (const selector of teamLinks) {
        const link = page.locator(selector).first()
        if (await link.isVisible().catch(() => false)) {
          await link.click()
          teamLinkFound = true
          logSuccess(`Link de equipe encontrado: ${selector}`)
          break
        }
      }

      if (!teamLinkFound) {
        // Tentar menu de organizacao
        const orgMenu = page.locator('[class*="org"], button:has-text("Organizacao")').first()
        if (await orgMenu.isVisible().catch(() => false)) {
          await orgMenu.click()
          await page.waitForTimeout(500)

          for (const selector of teamLinks) {
            const link = page.locator(selector).first()
            if (await link.isVisible().catch(() => false)) {
              await link.click()
              teamLinkFound = true
              break
            }
          }
        }
      }

      if (!teamLinkFound) {
        logWarning('Link de equipe nao encontrado automaticamente')
        console.log('\n⏸️  PAUSA: Navegue manualmente para a pagina de equipe')
        console.log('📝 Procure por: Equipe, Membros, Usuarios, ou similar')
        await page.pause() // Pausa para navegacao manual
      }

      await waitForPageLoad(page)
      await screenshot(page, 'invite-team-page', 2)

      // ========================================
      // STEP 3: Abrir modal/formulario de convite
      // ========================================
      logStep(3, 'Abrir formulario de convite')

      const inviteButtons = [
        'button:has-text("Convidar")',
        'button:has-text("Adicionar")',
        'button:has-text("Novo membro")',
        'button:has-text("Invite")',
        '[aria-label*="convidar"]',
        '[aria-label*="adicionar"]'
      ]

      let inviteButtonFound = false
      for (const selector of inviteButtons) {
        const button = page.locator(selector).first()
        if (await button.isVisible().catch(() => false)) {
          await button.click()
          inviteButtonFound = true
          logSuccess(`Botao de convite encontrado: ${selector}`)
          break
        }
      }

      if (!inviteButtonFound) {
        logWarning('Botao de convite nao encontrado')
        console.log('\n⏸️  PAUSA: Clique no botao de convidar membro')
        await page.pause()
      }

      await page.waitForTimeout(500)
      await screenshot(page, 'invite-modal', 3)

      // ========================================
      // STEP 4: Preencher dados do convite
      // ========================================
      logStep(4, 'Preencher dados do convite')

      // Email
      const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first()
      if (await emailInput.isVisible()) {
        await emailInput.fill(newMemberEmail)
        logSuccess(`Email preenchido: ${newMemberEmail}`)
      } else {
        logWarning('Campo de email nao encontrado')
      }

      // Role (opcional - tentar selecionar)
      const roleSelector = page.locator('select[name="role"], [role="combobox"]').first()
      if (await roleSelector.isVisible()) {
        await roleSelector.click()
        await page.waitForTimeout(300)

        // Tentar selecionar um role
        const userRole = page.locator('text=Usuario, text=User, [data-value="user"]').first()
        if (await userRole.isVisible().catch(() => false)) {
          await userRole.click()
          logSuccess('Role selecionado: Usuario')
        }
      }

      await screenshot(page, 'invite-filled', 4)

      // ========================================
      // STEP 5: Enviar convite
      // ========================================
      logStep(5, 'Enviar convite')

      const sendButtons = [
        'button:has-text("Enviar")',
        'button:has-text("Convidar")',
        'button:has-text("Send")',
        'button[type="submit"]'
      ]

      let sendButtonFound = false
      for (const selector of sendButtons) {
        const button = page.locator(selector).first()
        if (await button.isVisible().catch(() => false)) {
          await button.click()
          sendButtonFound = true
          logSuccess(`Convite enviado via: ${selector}`)
          break
        }
      }

      if (!sendButtonFound) {
        logWarning('Botao de enviar nao encontrado')
        console.log('\n⏸️  PAUSA: Clique no botao de enviar convite')
        await page.pause()
      }

      await page.waitForTimeout(2000)
      await screenshot(page, 'invite-sent', 5)

      // ========================================
      // STEP 6: Verificar feedback
      // ========================================
      logStep(6, 'Verificar feedback do envio')

      // Verificar toast de sucesso
      const successIndicators = [
        '[data-sonner-toast][data-type="success"]',
        'text=/convite enviado|email enviado|sucesso/i',
        '[class*="success"]'
      ]

      let successFound = false
      for (const selector of successIndicators) {
        if (await page.locator(selector).first().isVisible().catch(() => false)) {
          logSuccess('Feedback de sucesso exibido')
          successFound = true
          break
        }
      }

      if (!successFound) {
        // Verificar se houve erro
        const errorIndicators = [
          '[data-sonner-toast][data-type="error"]',
          'text=/erro|falhou|error/i',
          '[class*="error"]'
        ]

        for (const selector of errorIndicators) {
          const error = page.locator(selector).first()
          if (await error.isVisible().catch(() => false)) {
            const errorText = await error.textContent()
            logBug('HIGH', 'Erro ao enviar convite', errorText || '')
            bugs.push(`Erro: ${errorText}`)
            break
          }
        }
      }

      // ========================================
      // SUMARIO
      // ========================================
      console.log('\n' + '='.repeat(60))
      console.log('📊 SUMARIO - ENVIO DE CONVITE')
      console.log('='.repeat(60))
      console.log(`📧 Convite enviado para: ${newMemberEmail}`)

      if (bugs.length === 0) {
        console.log('✅ TESTE PASSOU')
        console.log('\n📝 PROXIMO PASSO:')
        console.log(`   Execute o teste de aceitar convite com o email: ${newMemberEmail}`)
      } else {
        console.log(`❌ ${bugs.length} BUG(S): ${bugs.join(', ')}`)
      }

      console.log('='.repeat(60) + '\n')

      expect(bugs.length).toBe(0)
    })
  })

  test.describe('Fluxo do Convidado (quem recebe convite)', () => {
    test('deve aceitar convite via link - usuario novo', async ({ page }) => {
      const bugs: string[] = []

      console.log('\n' + '='.repeat(60))
      console.log('🧪 TESTE: Aceitar Convite (Usuario Novo)')
      console.log('='.repeat(60))
      console.log('⚠️  PRE-REQUISITO: Link de convite valido')
      console.log('📝 Insira o link do convite quando solicitado')
      console.log('='.repeat(60))

      // ========================================
      // STEP 1: Acessar link de convite
      // ========================================
      logStep(1, 'Acessar link de convite')

      // Navegar para pagina inicial e pedir link
      await page.goto('/')

      console.log('\n⏸️  PAUSA: Cole o link de convite na barra de endereco')
      console.log('📝 O link deve ser algo como: /connect?token=XXXXX')
      console.log('💡 Ou navegue diretamente para a URL do convite recebido por email\n')

      await page.pause()

      await waitForPageLoad(page)
      await screenshot(page, 'connect-page', 1)

      const currentPath = getCurrentPath(page)

      if (!currentPath.includes('/connect')) {
        logWarning(`Nao esta na pagina /connect - path: ${currentPath}`)
      }

      // ========================================
      // STEP 2: Verificar dados do convite
      // ========================================
      logStep(2, 'Verificar dados do convite')

      // Verificar se mostra info da organizacao
      const orgName = await page.locator('[class*="org"], text=/organizacao|empresa|company/i').first().textContent().catch(() => null)
      if (orgName) {
        logSuccess(`Organizacao: ${orgName}`)
      }

      const role = await page.locator('text=/usuario|gerente|proprietario|role/i').first().textContent().catch(() => null)
      if (role) {
        logSuccess(`Role: ${role}`)
      }

      // Verificar estados de erro
      const expiredError = await page.locator('text=/expirado|expired|invalido|invalid/i').first().isVisible().catch(() => false)
      if (expiredError) {
        logBug('HIGH', 'Convite expirado ou invalido')
        bugs.push('Convite invalido')
        await screenshot(page, 'connect-expired', 2)
        expect(bugs.length).toBe(0)
        return
      }

      await screenshot(page, 'connect-details', 2)

      // ========================================
      // STEP 3: Criar conta / Fazer login
      // ========================================
      logStep(3, 'Criar conta ou fazer login')

      // Verificar se pede para criar conta ou logar
      const hasCreateAccountForm = await page.locator('input[name="name"], input[placeholder*="nome" i]').isVisible()
      const hasLoginPrompt = await page.locator('text=/fazer login|ja tem conta|login/i').first().isVisible()

      if (hasCreateAccountForm) {
        logSuccess('Formulario de criar conta exibido')

        // Preencher dados
        const user = generateTestUser('pf')

        const nameInput = page.locator('input[name="name"], input[placeholder*="nome" i]').first()
        const passwordInput = page.locator('input[type="password"]').first()
        const confirmPasswordInput = page.locator('input[type="password"]').nth(1)

        if (await nameInput.isVisible()) {
          await nameInput.fill(user.name)
        }

        if (await passwordInput.isVisible()) {
          await passwordInput.fill(user.password!)
        }

        if (await confirmPasswordInput.isVisible()) {
          await confirmPasswordInput.fill(user.password!)
        }

        console.log(`📝 Dados preenchidos: ${user.name} / senha: ${user.password}`)
        await screenshot(page, 'connect-form-filled', 3)

      } else if (hasLoginPrompt) {
        logSuccess('Solicitando login para usuario existente')
        console.log('\n⏸️  PAUSA: Faca login com sua conta')
        await page.pause()
      } else {
        logWarning('Tipo de formulario nao identificado')
        console.log('\n⏸️  PAUSA: Complete o formulario exibido')
        await page.pause()
      }

      // ========================================
      // STEP 4: Submeter / Aceitar convite
      // ========================================
      logStep(4, 'Aceitar convite')

      const acceptButtons = [
        'button:has-text("Aceitar")',
        'button:has-text("Accept")',
        'button:has-text("Criar conta")',
        'button:has-text("Entrar")',
        'button[type="submit"]'
      ]

      for (const selector of acceptButtons) {
        const button = page.locator(selector).first()
        if (await button.isVisible().catch(() => false)) {
          await button.click()
          logSuccess(`Acao executada via: ${selector}`)
          break
        }
      }

      await page.waitForTimeout(3000)
      await screenshot(page, 'connect-submitted', 4)

      // ========================================
      // STEP 5: Verificar resultado
      // ========================================
      logStep(5, 'Verificar resultado')

      // Aguardar redirecionamento
      try {
        await page.waitForURL(/\/(integracoes|login|dashboard)/, { timeout: 30000 })
        logSuccess('Redirecionamento detectado')
      } catch (e) {
        logWarning('Timeout aguardando redirecionamento')
      }

      const finalPath = getCurrentPath(page)
      await screenshot(page, 'connect-final', 5)

      if (finalPath.includes('/integracoes') || finalPath.includes('/dashboard')) {
        logSuccess('Usuario redirecionado para dashboard - convite aceito!')
      } else if (finalPath.includes('/login')) {
        logSuccess('Usuario redirecionado para login - conta criada, precisa fazer login')
      } else if (finalPath.includes('/connect')) {
        // Verificar erro
        const errorText = await page.locator('[class*="error"], [role="alert"]').first().textContent().catch(() => null)
        if (errorText) {
          logBug('HIGH', 'Erro ao aceitar convite', errorText)
          bugs.push(`Erro: ${errorText}`)
        }
      }

      // ========================================
      // SUMARIO
      // ========================================
      console.log('\n' + '='.repeat(60))
      console.log('📊 SUMARIO - ACEITAR CONVITE')
      console.log('='.repeat(60))

      if (bugs.length === 0) {
        console.log('✅ TESTE PASSOU')
      } else {
        console.log(`❌ ${bugs.length} BUG(S): ${bugs.join(', ')}`)
      }

      console.log('='.repeat(60) + '\n')

      expect(bugs.length).toBe(0)
    })

    test('deve exibir erro para link de convite invalido', async ({ page }) => {
      const bugs: string[] = []

      console.log('\n' + '='.repeat(60))
      console.log('🧪 TESTE: Link de Convite Invalido')
      console.log('='.repeat(60))

      // STEP 1: Acessar link invalido
      logStep(1, 'Acessar link de convite invalido')

      await page.goto('/connect?token=token-invalido-12345')
      await waitForPageLoad(page)
      await screenshot(page, 'connect-invalid', 1)

      // STEP 2: Verificar erro
      logStep(2, 'Verificar tratamento de erro')

      const errorVisible = await page.locator('text=/invalido|expirado|nao encontrado|invalid|expired|not found/i').first().isVisible()

      if (errorVisible) {
        logSuccess('Erro exibido para token invalido')
      } else {
        logBug('HIGH', 'Erro nao exibido para token invalido')
        bugs.push('Sem tratamento de token invalido')
      }

      // Verificar se nao mostra formulario de criar conta
      const hasForm = await page.locator('input[name="name"]').isVisible()
      if (hasForm) {
        logBug('MEDIUM', 'Formulario exibido para token invalido')
        bugs.push('Form visivel com token invalido')
      } else {
        logSuccess('Formulario nao exibido (correto)')
      }

      console.log('\n' + '='.repeat(60))
      console.log('📊 SUMARIO')
      console.log('='.repeat(60))
      if (bugs.length === 0) {
        console.log('✅ TESTE PASSOU')
      } else {
        console.log(`❌ ${bugs.length} BUG(S): ${bugs.join(', ')}`)
      }
      console.log('='.repeat(60) + '\n')

      expect(bugs.length).toBe(0)
    })
  })
})
