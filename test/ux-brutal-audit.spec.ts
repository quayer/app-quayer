import { test, expect, Page } from '@playwright/test'

/**
 * AUDITORIA BRUTAL DE UX - APP QUAYER
 *
 * Este teste realiza uma análise crítica completa de todas as páginas,
 * identificando problemas de usabilidade, inconsistências e más práticas de UX.
 */

const BASE_URL = 'http://localhost:3000'

// Credenciais para testes
const ADMIN_CREDENTIALS = {
  email: 'admin@quayer.com',
  password: 'admin123456'
}

interface UXIssue {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  page: string
  category: 'Navigation' | 'Visual' | 'Content' | 'Interaction' | 'Performance' | 'Accessibility' | 'Consistency'
  issue: string
  recommendation: string
}

const uxIssues: UXIssue[] = []

function reportIssue(issue: UXIssue) {
  uxIssues.push(issue)
  console.log(`\n🔴 ${issue.severity} [${issue.category}] ${issue.page}`)
  console.log(`   Issue: ${issue.issue}`)
  console.log(`   Fix: ${issue.recommendation}`)
}

async function auditPageLoad(page: Page, pageName: string) {
  const startTime = Date.now()
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
    reportIssue({
      severity: 'HIGH',
      page: pageName,
      category: 'Performance',
      issue: 'Page took more than 10s to reach networkidle state',
      recommendation: 'Optimize bundle size, implement code splitting, and lazy loading'
    })
  })
  const loadTime = Date.now() - startTime

  if (loadTime > 3000) {
    reportIssue({
      severity: 'MEDIUM',
      page: pageName,
      category: 'Performance',
      issue: `Page load time: ${loadTime}ms (>3s is poor UX)`,
      recommendation: 'Reduce initial bundle size, optimize images, implement skeleton loaders'
    })
  }
}

async function auditAccessibility(page: Page, pageName: string) {
  // Check for heading hierarchy
  const h1Count = await page.locator('h1').count()
  if (h1Count === 0) {
    reportIssue({
      severity: 'HIGH',
      page: pageName,
      category: 'Accessibility',
      issue: 'No H1 heading found on page',
      recommendation: 'Add a single, descriptive H1 heading for screen readers and SEO'
    })
  } else if (h1Count > 1) {
    reportIssue({
      severity: 'MEDIUM',
      page: pageName,
      category: 'Accessibility',
      issue: `Multiple H1 headings found (${h1Count})`,
      recommendation: 'Use only one H1 per page, use H2-H6 for subheadings'
    })
  }

  // Check for images without alt text
  const imagesWithoutAlt = await page.locator('img:not([alt])').count()
  if (imagesWithoutAlt > 0) {
    reportIssue({
      severity: 'HIGH',
      page: pageName,
      category: 'Accessibility',
      issue: `${imagesWithoutAlt} images without alt text`,
      recommendation: 'Add descriptive alt text to all images for screen reader users'
    })
  }

  // Check for form inputs without labels
  const inputsWithoutLabels = await page.locator('input:not([type="hidden"]):not([aria-label]):not([id])').count()
  if (inputsWithoutLabels > 0) {
    reportIssue({
      severity: 'HIGH',
      page: pageName,
      category: 'Accessibility',
      issue: `${inputsWithoutLabels} form inputs without proper labels`,
      recommendation: 'Associate labels with inputs using for/id or aria-label'
    })
  }
}

async function auditMobileResponsiveness(page: Page, pageName: string) {
  // Test mobile viewport
  await page.setViewportSize({ width: 375, height: 667 }) // iPhone SE size

  // Check for horizontal scroll
  const hasHorizontalScroll = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth
  })

  if (hasHorizontalScroll) {
    reportIssue({
      severity: 'CRITICAL',
      page: pageName,
      category: 'Visual',
      issue: 'Horizontal scroll present on mobile viewport',
      recommendation: 'Fix responsive design - content should fit viewport width'
    })
  }

  // Check for text too small on mobile
  const smallText = await page.locator('*').evaluateAll(elements => {
    return elements.filter(el => {
      const style = window.getComputedStyle(el)
      const fontSize = parseFloat(style.fontSize)
      return fontSize < 14 && el.textContent && el.textContent.trim().length > 0
    }).length
  })

  if (smallText > 0) {
    reportIssue({
      severity: 'MEDIUM',
      page: pageName,
      category: 'Visual',
      issue: `${smallText} elements with font size < 14px on mobile`,
      recommendation: 'Increase minimum font size to 14px for mobile readability'
    })
  }

  // Reset to desktop
  await page.setViewportSize({ width: 1920, height: 1080 })
}

async function auditInteractionFeedback(page: Page, pageName: string) {
  // Check all buttons for hover/focus states
  const buttons = await page.locator('button, a[role="button"], [class*="button"]').all()

  for (const button of buttons) {
    const isVisible = await button.isVisible().catch(() => false)
    if (!isVisible) continue

    // Check if button has visual feedback on hover
    await button.hover().catch(() => {})
    const hasHoverEffect = await button.evaluate(el => {
      const computedStyle = window.getComputedStyle(el)
      return computedStyle.cursor === 'pointer'
    }).catch(() => false)

    if (!hasHoverEffect) {
      const buttonText = await button.textContent().catch(() => 'Unknown')
      reportIssue({
        severity: 'LOW',
        page: pageName,
        category: 'Interaction',
        issue: `Button "${buttonText?.trim()}" lacks cursor pointer on hover`,
        recommendation: 'Add cursor: pointer to all interactive elements'
      })
      break // Report once per page to avoid spam
    }
  }
}

async function auditNavigation(page: Page, pageName: string) {
  // Check for navigation menu
  const navExists = await page.locator('nav').count() > 0
  if (!navExists) {
    reportIssue({
      severity: 'MEDIUM',
      page: pageName,
      category: 'Navigation',
      issue: 'No <nav> element found',
      recommendation: 'Add semantic <nav> element for better accessibility and structure'
    })
  }

  // Check for back/home navigation
  const hasBackButton = await page.locator('a[href="/"], button:has-text("Voltar"), button:has-text("Back")').count() > 0
  if (!hasBackButton && pageName !== 'Home') {
    reportIssue({
      severity: 'MEDIUM',
      page: pageName,
      category: 'Navigation',
      issue: 'No clear way to navigate back or to home',
      recommendation: 'Add back button or breadcrumbs for easier navigation'
    })
  }
}

async function auditErrorHandling(page: Page, pageName: string) {
  // Check for console errors
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })

  await page.waitForTimeout(2000)

  if (errors.length > 0) {
    reportIssue({
      severity: 'HIGH',
      page: pageName,
      category: 'Performance',
      issue: `${errors.length} console errors detected: ${errors[0]}`,
      recommendation: 'Fix JavaScript errors - they degrade user experience'
    })
  }
}

test.describe('AUDITORIA BRUTAL DE UX - Páginas Públicas', () => {
  test('Homepage - Análise Crítica', async ({ page }) => {
    console.log('\n🔍 AUDITANDO: Homepage')
    await page.goto(BASE_URL)
    await auditPageLoad(page, 'Homepage')
    await auditAccessibility(page, 'Homepage')
    await auditMobileResponsiveness(page, 'Homepage')
    await auditInteractionFeedback(page, 'Homepage')
    await auditNavigation(page, 'Homepage')
    await auditErrorHandling(page, 'Homepage')

    // Homepage specific checks
    const hasHero = await page.locator('h1').count() > 0
    if (!hasHero) {
      reportIssue({
        severity: 'CRITICAL',
        page: 'Homepage',
        category: 'Content',
        issue: 'Homepage has no clear hero/headline',
        recommendation: 'Add compelling H1 headline explaining value proposition'
      })
    }

    const hasCTA = await page.locator('a[href*="login"], a[href*="signup"], button:has-text("Começar")').count() > 0
    if (!hasCTA) {
      reportIssue({
        severity: 'CRITICAL',
        page: 'Homepage',
        category: 'Content',
        issue: 'No clear call-to-action on homepage',
        recommendation: 'Add prominent CTA button (e.g., "Começar Agora", "Criar Conta")'
      })
    }
  })
})

test.describe('AUDITORIA BRUTAL DE UX - Páginas de Autenticação', () => {
  test('Login Page - Análise Crítica', async ({ page }) => {
    console.log('\n🔍 AUDITANDO: Login Page')
    await page.goto(`${BASE_URL}/login`)
    await auditPageLoad(page, 'Login')
    await auditAccessibility(page, 'Login')
    await auditMobileResponsiveness(page, 'Login')
    await auditInteractionFeedback(page, 'Login')
    await auditNavigation(page, 'Login')

    // Login specific checks
    const emailInput = page.locator('input[type="email"], input[name="email"]')
    const passwordInput = page.locator('input[type="password"]')
    const submitButton = page.locator('button[type="submit"]')

    const hasEmailInput = await emailInput.count() > 0
    const hasPasswordInput = await passwordInput.count() > 0
    const hasSubmitButton = await submitButton.count() > 0

    if (!hasEmailInput) {
      reportIssue({
        severity: 'CRITICAL',
        page: 'Login',
        category: 'Content',
        issue: 'No email input field found',
        recommendation: 'Add email input field with proper type="email"'
      })
    }

    if (!hasPasswordInput) {
      reportIssue({
        severity: 'CRITICAL',
        page: 'Login',
        category: 'Content',
        issue: 'No password input field found',
        recommendation: 'Add password input field with proper type="password"'
      })
    }

    if (!hasSubmitButton) {
      reportIssue({
        severity: 'CRITICAL',
        page: 'Login',
        category: 'Content',
        issue: 'No submit button found',
        recommendation: 'Add clear submit button (e.g., "Entrar", "Login")'
      })
    }

    // Check for "Forgot Password" link
    const hasForgotPassword = await page.locator('a:has-text("Esqueceu"), a:has-text("Forgot")').count() > 0
    if (!hasForgotPassword) {
      reportIssue({
        severity: 'MEDIUM',
        page: 'Login',
        category: 'Content',
        issue: 'No "Forgot Password" link',
        recommendation: 'Add password recovery link for users who forgot credentials'
      })
    }

    // Check for signup link
    const hasSignupLink = await page.locator('a[href*="signup"], a[href*="register"], a:has-text("Criar conta")').count() > 0
    if (!hasSignupLink) {
      reportIssue({
        severity: 'HIGH',
        page: 'Login',
        category: 'Navigation',
        issue: 'No link to create new account',
        recommendation: 'Add clear link to signup page for new users'
      })
    }

    // Test actual login functionality
    if (hasEmailInput && hasPasswordInput && hasSubmitButton) {
      await emailInput.fill(ADMIN_CREDENTIALS.email)
      await passwordInput.fill(ADMIN_CREDENTIALS.password)
      await submitButton.click()

      // Check for loading state
      const hasLoadingState = await page.locator('[aria-busy="true"], .loading, [disabled]').count() > 0
      if (!hasLoadingState) {
        reportIssue({
          severity: 'MEDIUM',
          page: 'Login',
          category: 'Interaction',
          issue: 'No loading state shown during login',
          recommendation: 'Add loading spinner or disabled state during authentication'
        })
      }

      // Wait for redirect or error
      await page.waitForURL(/.*/, { timeout: 5000 }).catch(() => {})
    }
  })

  test('Signup/Register Page - Análise Crítica', async ({ page }) => {
    console.log('\n🔍 AUDITANDO: Signup Page')

    // Try common signup routes
    const signupRoutes = ['/signup', '/register', '/cadastro', '/criar-conta']
    let signupFound = false

    for (const route of signupRoutes) {
      const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => null)
      if (response && response.status() === 200) {
        signupFound = true
        await auditPageLoad(page, 'Signup')
        await auditAccessibility(page, 'Signup')
        await auditMobileResponsiveness(page, 'Signup')
        await auditInteractionFeedback(page, 'Signup')
        await auditNavigation(page, 'Signup')
        break
      }
    }

    if (!signupFound) {
      reportIssue({
        severity: 'CRITICAL',
        page: 'Signup',
        category: 'Navigation',
        issue: 'No signup/register page found at common routes',
        recommendation: 'Create signup page at /signup or /register'
      })
    }
  })
})

test.describe('AUDITORIA BRUTAL DE UX - Dashboard/App Principal', () => {
  test.beforeEach(async ({ page }) => {
    // Login antes de cada teste
    await page.goto(`${BASE_URL}/login`)
    await page.locator('input[type="email"], input[name="email"]').fill(ADMIN_CREDENTIALS.email)
    await page.locator('input[type="password"]').fill(ADMIN_CREDENTIALS.password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/.*/, { timeout: 10000 }).catch(() => {})
  })

  test('Dashboard Principal - Análise Crítica', async ({ page }) => {
    console.log('\n🔍 AUDITANDO: Dashboard')
    await auditPageLoad(page, 'Dashboard')
    await auditAccessibility(page, 'Dashboard')
    await auditMobileResponsiveness(page, 'Dashboard')
    await auditInteractionFeedback(page, 'Dashboard')
    await auditNavigation(page, 'Dashboard')

    // Dashboard specific checks
    const hasSidebar = await page.locator('aside, [role="navigation"]').count() > 0
    if (!hasSidebar) {
      reportIssue({
        severity: 'HIGH',
        page: 'Dashboard',
        category: 'Navigation',
        issue: 'No sidebar navigation found',
        recommendation: 'Add sidebar for main app navigation'
      })
    }

    const hasUserMenu = await page.locator('[role="menu"], .user-menu, button:has-text("Profile"), button:has-text("Perfil")').count() > 0
    if (!hasUserMenu) {
      reportIssue({
        severity: 'MEDIUM',
        page: 'Dashboard',
        category: 'Navigation',
        issue: 'No user menu/profile dropdown',
        recommendation: 'Add user menu with profile and logout options'
      })
    }

    const hasLogoutButton = await page.locator('button:has-text("Sair"), button:has-text("Logout"), a:has-text("Sair")').count() > 0
    if (!hasLogoutButton) {
      reportIssue({
        severity: 'HIGH',
        page: 'Dashboard',
        category: 'Navigation',
        issue: 'No visible logout button',
        recommendation: 'Add clear logout option in user menu'
      })
    }
  })

  test('Conversas/WhatsApp - Análise Crítica', async ({ page }) => {
    console.log('\n🔍 AUDITANDO: Conversas/WhatsApp')

    const conversasRoutes = ['/conversas', '/whatsapp', '/messages', '/chats']
    let conversasFound = false

    for (const route of conversasRoutes) {
      const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => null)
      if (response && response.status() === 200) {
        conversasFound = true
        await auditPageLoad(page, 'Conversas')
        await auditAccessibility(page, 'Conversas')
        await auditMobileResponsiveness(page, 'Conversas')
        await auditInteractionFeedback(page, 'Conversas')
        break
      }
    }

    if (!conversasFound) {
      reportIssue({
        severity: 'HIGH',
        page: 'Conversas',
        category: 'Navigation',
        issue: 'No conversations/WhatsApp page found',
        recommendation: 'Create conversations page at /conversas or /whatsapp'
      })
    }
  })

  test('Integrações - Análise Crítica', async ({ page }) => {
    console.log('\n🔍 AUDITANDO: Integrações')

    const integracoesRoutes = ['/integracoes', '/integrations', '/settings/integrations']
    let integracoesFound = false

    for (const route of integracoesRoutes) {
      const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => null)
      if (response && response.status() === 200) {
        integracoesFound = true
        await auditPageLoad(page, 'Integrações')
        await auditAccessibility(page, 'Integrações')
        await auditMobileResponsiveness(page, 'Integrações')
        await auditInteractionFeedback(page, 'Integrações')
        break
      }
    }

    if (!integracoesFound) {
      reportIssue({
        severity: 'MEDIUM',
        page: 'Integrações',
        category: 'Navigation',
        issue: 'No integrations page found',
        recommendation: 'Create integrations page at /integracoes'
      })
    }
  })

  test('Configurações - Análise Crítica', async ({ page }) => {
    console.log('\n🔍 AUDITANDO: Configurações')

    const configRoutes = ['/configuracoes', '/settings', '/config']
    let configFound = false

    for (const route of configRoutes) {
      const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => null)
      if (response && response.status() === 200) {
        configFound = true
        await auditPageLoad(page, 'Configurações')
        await auditAccessibility(page, 'Configurações')
        await auditMobileResponsiveness(page, 'Configurações')
        await auditInteractionFeedback(page, 'Configurações')
        break
      }
    }

    if (!configFound) {
      reportIssue({
        severity: 'MEDIUM',
        page: 'Configurações',
        category: 'Navigation',
        issue: 'No settings page found',
        recommendation: 'Create settings page at /configuracoes or /settings'
      })
    }
  })
})

test.afterAll(() => {
  console.log('\n\n' + '='.repeat(80))
  console.log('📊 RELATÓRIO FINAL DE AUDITORIA BRUTAL DE UX')
  console.log('='.repeat(80))

  const criticalIssues = uxIssues.filter(i => i.severity === 'CRITICAL')
  const highIssues = uxIssues.filter(i => i.severity === 'HIGH')
  const mediumIssues = uxIssues.filter(i => i.severity === 'MEDIUM')
  const lowIssues = uxIssues.filter(i => i.severity === 'LOW')

  console.log(`\n🔴 CRITICAL Issues: ${criticalIssues.length}`)
  console.log(`🟠 HIGH Issues: ${highIssues.length}`)
  console.log(`🟡 MEDIUM Issues: ${mediumIssues.length}`)
  console.log(`🟢 LOW Issues: ${lowIssues.length}`)
  console.log(`\n📈 TOTAL ISSUES: ${uxIssues.length}`)

  console.log('\n\n' + '─'.repeat(80))
  console.log('🔴 CRITICAL ISSUES (FIX IMMEDIATELY)')
  console.log('─'.repeat(80))
  criticalIssues.forEach((issue, index) => {
    console.log(`\n${index + 1}. [${issue.page}] ${issue.category}`)
    console.log(`   Problem: ${issue.issue}`)
    console.log(`   Solution: ${issue.recommendation}`)
  })

  console.log('\n\n' + '─'.repeat(80))
  console.log('🟠 HIGH PRIORITY ISSUES')
  console.log('─'.repeat(80))
  highIssues.forEach((issue, index) => {
    console.log(`\n${index + 1}. [${issue.page}] ${issue.category}`)
    console.log(`   Problem: ${issue.issue}`)
    console.log(`   Solution: ${issue.recommendation}`)
  })

  console.log('\n\n' + '─'.repeat(80))
  console.log('🟡 MEDIUM PRIORITY ISSUES')
  console.log('─'.repeat(80))
  mediumIssues.forEach((issue, index) => {
    console.log(`\n${index + 1}. [${issue.page}] ${issue.category}`)
    console.log(`   Problem: ${issue.issue}`)
    console.log(`   Solution: ${issue.recommendation}`)
  })

  console.log('\n\n' + '─'.repeat(80))
  console.log('📋 SUMÁRIO POR CATEGORIA')
  console.log('─'.repeat(80))

  const categories = ['Navigation', 'Visual', 'Content', 'Interaction', 'Performance', 'Accessibility', 'Consistency']
  categories.forEach(category => {
    const categoryIssues = uxIssues.filter(i => i.category === category)
    if (categoryIssues.length > 0) {
      console.log(`\n${category}: ${categoryIssues.length} issues`)
    }
  })

  console.log('\n\n' + '='.repeat(80))
  console.log('✅ AUDITORIA BRUTAL CONCLUÍDA')
  console.log('='.repeat(80) + '\n')
})
