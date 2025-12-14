/**
 * AI Log Analyzer Service
 *
 * Analyzes audit logs using OpenAI GPT-4 to provide:
 * - Error root cause analysis
 * - Code fix suggestions
 * - Pattern detection
 * - Security recommendations
 *
 * Uses project context from .cursor/rules/*.mdc files for better insights.
 */

import OpenAI from 'openai'
import { database } from '@/services/database'
import { logger } from '@/services/logger'
import fs from 'fs/promises'
import path from 'path'

// ============================================
// TYPES
// ============================================

export interface LogAnalysisInput {
  logIds?: string[]
  dateRange?: {
    start: Date
    end: Date
  }
  level?: 'error' | 'warn' | 'info'
  resource?: string
  action?: string
  limit?: number
}

export interface LogAnalysisResult {
  summary: string
  errorPatterns: ErrorPattern[]
  recommendations: Recommendation[]
  codeFixSuggestions: CodeFixSuggestion[]
  securityConcerns: string[]
  performanceIssues: string[]
  metadata: {
    logsAnalyzed: number
    processingTimeMs: number
    model: string
    timestamp: Date
  }
}

export interface ErrorPattern {
  pattern: string
  occurrences: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  affectedResources: string[]
  description: string
}

export interface Recommendation {
  title: string
  description: string
  priority: 'immediate' | 'high' | 'medium' | 'low'
  category: 'bug' | 'security' | 'performance' | 'ux' | 'architecture'
}

export interface CodeFixSuggestion {
  file: string
  line?: number
  currentCode?: string
  suggestedCode: string
  explanation: string
  confidence: number
}

// ============================================
// LOG ANALYZER SERVICE
// ============================================

class LogAnalyzerService {
  private openai: OpenAI
  private projectContext: string | null = null
  private contextLoadedAt: Date | null = null
  private contextTTL = 1000 * 60 * 60 // 1 hour

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  /**
   * Load project context from .cursor/rules/*.mdc files
   */
  private async loadProjectContext(): Promise<string> {
    // Return cached context if fresh
    if (
      this.projectContext &&
      this.contextLoadedAt &&
      Date.now() - this.contextLoadedAt.getTime() < this.contextTTL
    ) {
      return this.projectContext
    }

    const rulesDir = path.join(process.cwd(), '.cursor', 'rules')
    let context = ''

    try {
      const files = await fs.readdir(rulesDir)
      const mdcFiles = files.filter((f) => f.endsWith('.mdc'))

      for (const file of mdcFiles) {
        try {
          const content = await fs.readFile(path.join(rulesDir, file), 'utf-8')
          context += `\n\n--- ${file} ---\n${content}`
        } catch {
          // Skip files that can't be read
        }
      }

      // Also add CLAUDE.md if exists
      const claudeMd = path.join(process.cwd(), 'CLAUDE.md')
      try {
        const claudeContent = await fs.readFile(claudeMd, 'utf-8')
        context += `\n\n--- CLAUDE.md (Project Instructions) ---\n${claudeContent}`
      } catch {
        // File doesn't exist or can't be read
      }

      this.projectContext = context
      this.contextLoadedAt = new Date()

      logger.info('[LogAnalyzer] Project context loaded', {
        filesLoaded: mdcFiles.length,
        contextLength: context.length,
      })

      return context
    } catch (error) {
      logger.warn('[LogAnalyzer] Could not load project context', { error })
      return ''
    }
  }

  /**
   * Format audit logs for AI analysis
   */
  private formatLogsForAnalysis(logs: any[]): string {
    return logs
      .map((log, index) => {
        const metadata = log.metadata || {}
        return `
[LOG ${index + 1}]
- Timestamp: ${log.createdAt}
- Action: ${log.action}
- Resource: ${log.resource}
- Resource ID: ${log.resourceId || 'N/A'}
- User: ${log.userId}
- Organization: ${log.organizationId || 'N/A'}
- Level: ${metadata.level || 'info'}
- Error Message: ${metadata.errorMessage || 'N/A'}
- Error Stack: ${metadata.errorStack ? metadata.errorStack.substring(0, 500) : 'N/A'}
- IP Address: ${log.ipAddress || 'N/A'}
- Additional Data: ${JSON.stringify(metadata, null, 2).substring(0, 500)}
`
      })
      .join('\n---\n')
  }

  /**
   * Analyze logs using AI
   */
  async analyzeLogs(input: LogAnalysisInput = {}): Promise<LogAnalysisResult> {
    const startTime = Date.now()

    // 1. Fetch logs from database
    const where: any = {}

    if (input.logIds && input.logIds.length > 0) {
      where.id = { in: input.logIds }
    }

    if (input.dateRange) {
      where.createdAt = {
        gte: input.dateRange.start,
        lte: input.dateRange.end,
      }
    }

    if (input.level) {
      where.metadata = {
        path: ['level'],
        equals: input.level,
      }
    }

    if (input.resource) {
      where.resource = input.resource
    }

    if (input.action) {
      where.action = input.action
    }

    const logs = await database.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: input.limit || 100,
      include: {
        user: {
          select: { email: true, name: true },
        },
        organization: {
          select: { name: true },
        },
      },
    })

    if (logs.length === 0) {
      return {
        summary: 'Nenhum log encontrado para análise com os filtros especificados.',
        errorPatterns: [],
        recommendations: [],
        codeFixSuggestions: [],
        securityConcerns: [],
        performanceIssues: [],
        metadata: {
          logsAnalyzed: 0,
          processingTimeMs: Date.now() - startTime,
          model: 'none',
          timestamp: new Date(),
        },
      }
    }

    // 2. Load project context
    const projectContext = await this.loadProjectContext()

    // 3. Format logs for analysis
    const formattedLogs = this.formatLogsForAnalysis(logs)

    // 4. Create AI prompt
    const systemPrompt = `Você é um especialista em análise de logs e debugging de aplicações Next.js/TypeScript.
Você tem acesso ao contexto completo do projeto para fornecer recomendações precisas.

CONTEXTO DO PROJETO:
${projectContext.substring(0, 15000)}

INSTRUÇÕES:
1. Analise os logs fornecidos e identifique padrões de erro
2. Forneça sugestões de correção de código específicas
3. Identifique problemas de segurança
4. Detecte possíveis problemas de performance
5. Priorize recomendações por impacto

Responda SEMPRE em JSON válido com a seguinte estrutura:
{
  "summary": "Resumo executivo da análise",
  "errorPatterns": [
    {
      "pattern": "nome do padrão",
      "occurrences": número,
      "severity": "critical|high|medium|low",
      "affectedResources": ["recurso1", "recurso2"],
      "description": "descrição detalhada"
    }
  ],
  "recommendations": [
    {
      "title": "título da recomendação",
      "description": "descrição detalhada",
      "priority": "immediate|high|medium|low",
      "category": "bug|security|performance|ux|architecture"
    }
  ],
  "codeFixSuggestions": [
    {
      "file": "caminho/do/arquivo.ts",
      "line": 123,
      "currentCode": "código atual (opcional)",
      "suggestedCode": "código sugerido",
      "explanation": "explicação da mudança",
      "confidence": 0.95
    }
  ],
  "securityConcerns": ["preocupação 1", "preocupação 2"],
  "performanceIssues": ["issue 1", "issue 2"]
}`

    const userPrompt = `Analise os seguintes ${logs.length} logs de auditoria e forneça insights:

${formattedLogs}

Responda em JSON conforme a estrutura especificada.`

    // 5. Call OpenAI
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      })

      const responseText = completion.choices[0]?.message?.content || '{}'
      const analysis = JSON.parse(responseText)

      logger.info('[LogAnalyzer] Analysis completed', {
        logsAnalyzed: logs.length,
        processingTimeMs: Date.now() - startTime,
        model: 'gpt-4o',
      })

      return {
        ...analysis,
        metadata: {
          logsAnalyzed: logs.length,
          processingTimeMs: Date.now() - startTime,
          model: 'gpt-4o',
          timestamp: new Date(),
        },
      }
    } catch (error: any) {
      logger.error('[LogAnalyzer] AI analysis failed', {
        error: error.message,
        logsCount: logs.length,
      })

      throw new Error(`Falha na análise de logs: ${error.message}`)
    }
  }

  /**
   * Analyze a single error in detail
   */
  async analyzeError(errorMessage: string, errorStack?: string): Promise<{
    rootCause: string
    suggestedFix: string
    relatedFiles: string[]
    confidence: number
  }> {
    const projectContext = await this.loadProjectContext()

    const prompt = `Analise este erro e forneça uma solução:

ERRO: ${errorMessage}

STACK TRACE:
${errorStack || 'Não disponível'}

CONTEXTO DO PROJETO:
${projectContext.substring(0, 10000)}

Responda em JSON:
{
  "rootCause": "explicação da causa raiz",
  "suggestedFix": "código ou passos para corrigir",
  "relatedFiles": ["arquivo1.ts", "arquivo2.ts"],
  "confidence": 0.85
}`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    })

    const response = JSON.parse(completion.choices[0]?.message?.content || '{}')
    return response
  }

  /**
   * Get quick summary of recent errors
   */
  async getErrorSummary(hours: number = 24): Promise<{
    totalErrors: number
    byResource: Record<string, number>
    byAction: Record<string, number>
    topErrors: { message: string; count: number }[]
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    const logs = await database.auditLog.findMany({
      where: {
        createdAt: { gte: since },
        metadata: {
          path: ['level'],
          equals: 'error',
        },
      },
    })

    const byResource: Record<string, number> = {}
    const byAction: Record<string, number> = {}
    const errorMessages: Record<string, number> = {}

    for (const log of logs) {
      byResource[log.resource] = (byResource[log.resource] || 0) + 1
      byAction[log.action] = (byAction[log.action] || 0) + 1

      const metadata = log.metadata as any
      if (metadata?.errorMessage) {
        const msg = metadata.errorMessage.substring(0, 100)
        errorMessages[msg] = (errorMessages[msg] || 0) + 1
      }
    }

    const topErrors = Object.entries(errorMessages)
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      totalErrors: logs.length,
      byResource,
      byAction,
      topErrors,
    }
  }
}

// Export singleton
export const logAnalyzer = new LogAnalyzerService()
