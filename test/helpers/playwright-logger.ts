/**
 * Playwright Logger
 *
 * Structured logging for E2E tests with Playwright
 * - Captures all test steps
 * - Logs browser console messages
 * - Tracks network requests
 * - Records screenshots on failure
 *
 * Usage:
 * ```typescript
 * import { PlaywrightLogger } from './helpers/playwright-logger'
 *
 * test('Create connection', async ({ page }) => {
 *   const logger = new PlaywrightLogger(page, 'create-connection')
 *
 *   await logger.step('Navigate to integrations', async () => {
 *     await page.goto('/integrations')
 *   })
 *
 *   await logger.step('Click create button', async () => {
 *     await page.click('[data-testid="create-connection"]')
 *   })
 * })
 * ```
 */

import { Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'

export interface TestStep {
  name: string
  status: 'started' | 'completed' | 'failed'
  duration?: number
  error?: string
  screenshot?: string
  timestamp: number
}

export interface NetworkRequest {
  url: string
  method: string
  status?: number
  duration?: number
  timestamp: number
}

export interface ConsoleMessage {
  type: 'log' | 'info' | 'warn' | 'error'
  text: string
  timestamp: number
}

export class PlaywrightLogger {
  private testName: string
  private page: Page
  private steps: TestStep[] = []
  private networkRequests: NetworkRequest[] = []
  private consoleMessages: ConsoleMessage[] = []
  private screenshotsDir: string
  private logsDir: string
  private startTime: number

  constructor(page: Page, testName: string) {
    this.page = page
    this.testName = testName
    this.startTime = Date.now()

    // Setup directories
    this.screenshotsDir = path.join(process.cwd(), 'test-screenshots', testName)
    this.logsDir = path.join(process.cwd(), 'test-logs')

    // Create directories if they don't exist
    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir, { recursive: true })
    }
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true })
    }

    // Setup listeners
    this.setupListeners()
  }

  /**
   * Setup page listeners for console and network
   */
  private setupListeners() {
    // Console messages
    this.page.on('console', (msg) => {
      const type = msg.type() as 'log' | 'info' | 'warn' | 'error'
      this.consoleMessages.push({
        type,
        text: msg.text(),
        timestamp: Date.now(),
      })

      // Log errors immediately
      if (type === 'error') {
        console.error(`[Browser Console Error] ${msg.text()}`)
      }
    })

    // Page errors
    this.page.on('pageerror', (error) => {
      this.consoleMessages.push({
        type: 'error',
        text: error.message,
        timestamp: Date.now(),
      })
      console.error(`[Browser Page Error] ${error.message}`)
    })

    // Network requests
    this.page.on('request', (request) => {
      const url = request.url()
      // Only log API requests
      if (url.includes('/api/')) {
        this.networkRequests.push({
          url,
          method: request.method(),
          timestamp: Date.now(),
        })
      }
    })

    this.page.on('response', (response) => {
      const url = response.url()
      // Only log API responses
      if (url.includes('/api/')) {
        const request = this.networkRequests.find(
          (req) => req.url === url && !req.status
        )
        if (request) {
          request.status = response.status()
        }
      }
    })
  }

  /**
   * Log a test step
   */
  async step<T>(
    stepName: string,
    fn: () => Promise<T>,
    options?: { screenshot?: boolean }
  ): Promise<T> {
    const step: TestStep = {
      name: stepName,
      status: 'started',
      timestamp: Date.now(),
    }

    this.steps.push(step)
    console.log(`\n▶️  [STEP] ${stepName}`)

    const startTime = Date.now()

    try {
      const result = await fn()

      step.status = 'completed'
      step.duration = Date.now() - startTime

      console.log(`✅ [STEP COMPLETED] ${stepName} (${step.duration}ms)`)

      // Optional screenshot
      if (options?.screenshot) {
        await this.takeScreenshot(this.sanitizeFilename(stepName))
      }

      return result
    } catch (error: any) {
      step.status = 'failed'
      step.duration = Date.now() - startTime
      step.error = error.message

      console.error(`❌ [STEP FAILED] ${stepName} (${step.duration}ms)`)
      console.error(`   Error: ${error.message}`)

      // Always screenshot on failure
      const screenshotPath = await this.takeScreenshot(
        `FAILED-${this.sanitizeFilename(stepName)}`
      )
      step.screenshot = screenshotPath

      throw error
    }
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(name: string): Promise<string> {
    const filename = `${Date.now()}-${name}.png`
    const filepath = path.join(this.screenshotsDir, filename)

    await this.page.screenshot({
      path: filepath,
      fullPage: true,
    })

    console.log(`📸 Screenshot saved: ${filepath}`)
    return filepath
  }

  /**
   * Wait for API response
   */
  async waitForApiResponse(
    urlPattern: string | RegExp,
    options?: { timeout?: number; status?: number }
  ): Promise<any> {
    const timeout = options?.timeout || 30000
    const expectedStatus = options?.status || 200

    return await this.step(
      `Wait for API response: ${urlPattern}`,
      async () => {
        const response = await this.page.waitForResponse(
          (resp) => {
            const url = resp.url()
            const matches =
              typeof urlPattern === 'string'
                ? url.includes(urlPattern)
                : urlPattern.test(url)

            return matches && resp.status() === expectedStatus
          },
          { timeout }
        )

        return await response.json()
      }
    )
  }

  /**
   * Generate test report
   */
  async generateReport() {
    const duration = Date.now() - this.startTime

    const report = {
      testName: this.testName,
      duration,
      startTime: this.startTime,
      endTime: Date.now(),
      steps: this.steps,
      networkRequests: this.networkRequests,
      consoleMessages: this.consoleMessages,
      summary: {
        totalSteps: this.steps.length,
        completedSteps: this.steps.filter((s) => s.status === 'completed').length,
        failedSteps: this.steps.filter((s) => s.status === 'failed').length,
        totalRequests: this.networkRequests.length,
        failedRequests: this.networkRequests.filter(
          (r) => r.status && r.status >= 400
        ).length,
        consoleErrors: this.consoleMessages.filter((m) => m.type === 'error')
          .length,
      },
    }

    // Save report to file
    const reportPath = path.join(
      this.logsDir,
      `${this.testName}-${Date.now()}.json`
    )
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

    console.log('\n' + '='.repeat(60))
    console.log('📊 TEST REPORT')
    console.log('='.repeat(60))
    console.log(`Test: ${this.testName}`)
    console.log(`Duration: ${duration}ms`)
    console.log(`Steps: ${report.summary.completedSteps}/${report.summary.totalSteps} completed`)
    console.log(`Failed Steps: ${report.summary.failedSteps}`)
    console.log(`Network Requests: ${report.summary.totalRequests}`)
    console.log(`Failed Requests: ${report.summary.failedRequests}`)
    console.log(`Console Errors: ${report.summary.consoleErrors}`)
    console.log(`Report saved: ${reportPath}`)
    console.log('='.repeat(60) + '\n')

    return report
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }
}
