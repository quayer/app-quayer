/**
 * AI Log Analyzer Service
 *
 * Uses LangChain + OpenAI to analyze logs and detect patterns
 */

import { database } from '@/services/database'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { LogLevel } from '@prisma/client'

export interface LogPattern {
  type: string
  description: string
  count: number
  severity: number
  examples: string[]
  suggestion: string
}

export interface LogAnomaly {
  type: string
  description: string
  severity: number
  affectedLogs: string[]
  suggestion: string
}

export interface AnalysisResult {
  summary: string
  patterns: LogPattern[]
  anomalies: LogAnomaly[]
  suggestions: string[]
  metrics: {
    totalLogs: number
    errorRate: number
    avgResponseTime: number | null
    topSources: { source: string; count: number }[]
  }
  severity: number
}

class AILogAnalyzer {
  private model: ChatOpenAI | null = null

  private getModel(): ChatOpenAI {
    if (!this.model) {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY not configured')
      }
      this.model = new ChatOpenAI({
        modelName: 'gpt-4o', // Updated from gpt-4o-mini for better analysis
        temperature: 0.3,
        openAIApiKey: apiKey,
      })
    }
    return this.model
  }

  async analyzeLogs(params: {
    startDate?: Date
    endDate?: Date
    source?: string
    level?: LogLevel
    limit?: number
  }): Promise<AnalysisResult> {
    const {
      startDate = new Date(Date.now() - 60 * 60 * 1000), // Last hour
      endDate = new Date(),
      source,
      level,
      limit = 500,
    } = params

    // Fetch logs
    const where: any = {
      timestamp: { gte: startDate, lte: endDate },
    }
    if (source) where.source = source
    if (level) where.level = level

    const logs = await database.logEntry.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    })

    if (logs.length === 0) {
      return {
        summary: 'Nenhum log encontrado no período especificado.',
        patterns: [],
        anomalies: [],
        suggestions: [],
        metrics: {
          totalLogs: 0,
          errorRate: 0,
          avgResponseTime: null,
          topSources: [],
        },
        severity: 0,
      }
    }

    // Calculate basic metrics
    const totalLogs = logs.length
    const errorLogs = logs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL')
    const errorRate = (errorLogs.length / totalLogs) * 100

    const logsWithDuration = logs.filter(l => l.duration !== null)
    const avgResponseTime = logsWithDuration.length > 0
      ? logsWithDuration.reduce((sum, l) => sum + (l.duration || 0), 0) / logsWithDuration.length
      : null

    // Group by source
    const sourceGroups = logs.reduce((acc, log) => {
      acc[log.source] = (acc[log.source] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const topSources = Object.entries(sourceGroups)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Prepare log summary for AI
    const logSummary = this.prepareLogSummary(logs)

    // Call AI for analysis
    try {
      const model = this.getModel()

      const systemPrompt = `Você é um especialista em análise de logs de sistemas web.
Analise os logs fornecidos e identifique:
1. Padrões recorrentes (erros repetidos, picos de atividade, etc)
2. Anomalias (comportamentos incomuns, possíveis ataques, falhas críticas)
3. Sugestões de correção para cada problema encontrado

Responda SEMPRE em JSON válido com esta estrutura:
{
  "summary": "Resumo executivo em português",
  "patterns": [
    {
      "type": "tipo_padrao",
      "description": "descrição do padrão",
      "count": numero_ocorrencias,
      "severity": 1-10,
      "examples": ["exemplo1", "exemplo2"],
      "suggestion": "sugestão de correção"
    }
  ],
  "anomalies": [
    {
      "type": "tipo_anomalia",
      "description": "descrição da anomalia",
      "severity": 1-10,
      "affectedLogs": ["log_id1", "log_id2"],
      "suggestion": "sugestão de correção"
    }
  ],
  "suggestions": ["sugestão geral 1", "sugestão geral 2"],
  "overallSeverity": 1-10
}`

      const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(`Analise estes logs do sistema:\n\n${logSummary}`),
      ])

      const content = response.content.toString()

      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('Failed to parse AI response as JSON')
      }

      const aiResult = JSON.parse(jsonMatch[0])

      // Save analysis to database
      await database.logAnalysis.create({
        data: {
          periodStart: startDate,
          periodEnd: endDate,
          type: 'realtime',
          summary: aiResult.summary,
          patterns: aiResult.patterns || [],
          anomalies: aiResult.anomalies || [],
          suggestions: aiResult.suggestions || [],
          metrics: {
            totalLogs,
            errorRate,
            avgResponseTime,
            topSources,
          },
          severity: aiResult.overallSeverity || 0,
          aiModel: 'gpt-4o',
        },
      })

      return {
        summary: aiResult.summary,
        patterns: aiResult.patterns || [],
        anomalies: aiResult.anomalies || [],
        suggestions: aiResult.suggestions || [],
        metrics: {
          totalLogs,
          errorRate,
          avgResponseTime,
          topSources,
        },
        severity: aiResult.overallSeverity || 0,
      }
    } catch (error: any) {
      console.error('[AILogAnalyzer] Analysis failed:', error.message)

      // Return basic analysis without AI
      return {
        summary: `Análise de ${totalLogs} logs. Taxa de erro: ${errorRate.toFixed(1)}%.${
          errorRate > 10 ? ' ⚠️ Taxa de erro elevada!' : ''
        }`,
        patterns: this.detectBasicPatterns(logs),
        anomalies: [],
        suggestions: this.generateBasicSuggestions(logs, errorRate),
        metrics: {
          totalLogs,
          errorRate,
          avgResponseTime,
          topSources,
        },
        severity: errorRate > 20 ? 8 : errorRate > 10 ? 5 : errorRate > 5 ? 3 : 1,
      }
    }
  }

  private prepareLogSummary(logs: any[]): string {
    // Group logs by level and source for AI analysis
    const grouped = logs.reduce((acc, log) => {
      const key = `${log.level}:${log.source}`
      if (!acc[key]) {
        acc[key] = { count: 0, examples: [] }
      }
      acc[key].count++
      if (acc[key].examples.length < 3) {
        acc[key].examples.push({
          message: log.message.substring(0, 200),
          action: log.action,
          timestamp: log.timestamp,
        })
      }
      return acc
    }, {} as Record<string, { count: number; examples: any[] }>)

    return JSON.stringify(grouped, null, 2)
  }

  private detectBasicPatterns(logs: any[]): LogPattern[] {
    const patterns: LogPattern[] = []

    // Detect repeated errors
    const errorMessages = logs
      .filter(l => l.level === 'ERROR' || l.level === 'CRITICAL')
      .reduce((acc, log) => {
        const key = log.message.substring(0, 100)
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {} as Record<string, number>)

    Object.entries(errorMessages)
      .filter(([_, count]) => (count as number) >= 3)
      .forEach(([message, count]) => {
        const countNum = count as number
        patterns.push({
          type: 'repeated_error',
          description: `Erro repetido ${countNum} vezes: ${message}`,
          count: countNum,
          severity: countNum > 10 ? 8 : countNum > 5 ? 5 : 3,
          examples: [message],
          suggestion: 'Investigar causa raiz do erro repetido',
        })
      })

    return patterns
  }

  private generateBasicSuggestions(logs: any[], errorRate: number): string[] {
    const suggestions: string[] = []

    if (errorRate > 10) {
      suggestions.push('Taxa de erro elevada - investigar logs de ERROR e CRITICAL')
    }

    const authErrors = logs.filter(l => l.source === 'auth' && l.level === 'ERROR').length
    if (authErrors > 5) {
      suggestions.push('Múltiplos erros de autenticação - verificar possíveis tentativas de ataque')
    }

    const webhookErrors = logs.filter(l => l.source === 'webhook' && l.level === 'ERROR').length
    if (webhookErrors > 3) {
      suggestions.push('Falhas em webhooks - verificar conectividade e endpoints')
    }

    return suggestions
  }

  async analyzeError(logId: string): Promise<{ analysis: string; suggestion: string }> {
    const log = await database.logEntry.findUnique({ where: { id: logId } })

    if (!log) {
      throw new Error('Log not found')
    }

    try {
      const model = this.getModel()

      const response = await model.invoke([
        new SystemMessage(`Você é um especialista em debugging. Analise este erro e forneça:
1. Análise detalhada do problema
2. Sugestão de correção específica

Responda em JSON: { "analysis": "...", "suggestion": "..." }`),
        new HumanMessage(`Erro: ${log.message}
Stack: ${log.stackTrace || 'N/A'}
Contexto: ${JSON.stringify(log.context)}
Metadata: ${JSON.stringify(log.metadata)}`),
      ])

      const content = response.content.toString()
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('Failed to parse AI response')
      }

      const result = JSON.parse(jsonMatch[0])

      // Update log with AI analysis
      await database.logEntry.update({
        where: { id: logId },
        data: {
          aiAnalysis: result.analysis,
          aiSuggestion: result.suggestion,
          aiAnalyzedAt: new Date(),
          aiSeverity: log.level === 'CRITICAL' ? 10 : log.level === 'ERROR' ? 7 : 3,
        },
      })

      return result
    } catch (error: any) {
      console.error('[AILogAnalyzer] Error analysis failed:', error.message)
      return {
        analysis: 'Análise automática não disponível',
        suggestion: 'Verificar configuração de OpenAI API Key',
      }
    }
  }

  // Get recent analyses
  async getRecentAnalyses(limit = 10) {
    return database.logAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }
}

export const aiLogAnalyzer = new AILogAnalyzer()
