'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FileText, Search, Download, AlertCircle, Info, AlertTriangle,
  CheckCircle2, RefreshCcw, Brain, Sparkles, X, Loader2, Zap,
  Activity, Server, Database, Shield, Clock, TrendingUp, TrendingDown,
  Play, Pause, Bug, Skull, Radio
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'

/**
 * Admin Logs Page - Premium Edition
 *
 * Features:
 * - Real-time log streaming via SSE
 * - AI-powered log analysis with LangChain/OpenAI
 * - Advanced filtering and search
 * - Log statistics and metrics
 * - Pattern detection and anomaly alerts
 */

interface LogEntry {
  id: string
  timestamp: string
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
  source: string
  action: string | null
  message: string
  details: string | null
  stackTrace: string | null
  context: any
  metadata: any
  requestId: string | null
  requestPath: string | null
  requestMethod: string | null
  statusCode: number | null
  duration: number | null
  userId: string | null
  organizationId: string | null
  tags: string[]
  aiAnalysis: string | null
  aiSuggestion: string | null
  aiSeverity: number | null
}

interface LogStats {
  period: string
  total: number
  byLevel: {
    DEBUG: number
    INFO: number
    WARN: number
    ERROR: number
    CRITICAL: number
  }
  bySource: { source: string; count: number }[]
  recentErrors: LogEntry[]
}

interface AIAnalysis {
  summary: string
  patterns: {
    type: string
    description: string
    count: number
    severity: number
    examples: string[]
    suggestion: string
  }[]
  anomalies: {
    type: string
    description: string
    severity: number
    suggestion: string
  }[]
  suggestions: string[]
  metrics: {
    totalLogs: number
    errorRate: number
    avgResponseTime: number | null
    topSources: { source: string; count: number }[]
  }
  severity: number
}

const levelConfig = {
  DEBUG: { icon: Bug, color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
  INFO: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  WARN: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  ERROR: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  CRITICAL: { icon: Skull, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
}

const sourceIcons: Record<string, any> = {
  auth: Shield,
  api: Server,
  webhook: Zap,
  whatsapp: Radio,
  database: Database,
  ai: Brain,
  system: Activity,
  cron: Clock,
  default: FileText,
}

export default function AdminLogsPage() {
  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  // Data
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<LogStats | null>(null)
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [sources, setSources] = useState<string[]>([])

  // Loading states
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Real-time streaming
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamLogs, setStreamLogs] = useState<LogEntry[]>([])
  const eventSourceRef = useRef<EventSource | null>(null)

  // AI Analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [showAiModal, setShowAiModal] = useState(false)
  const [analyzingLogId, setAnalyzingLogId] = useState<string | null>(null)
  const [cachedAnalysis, setCachedAnalysis] = useState<{ data: AIAnalysis; timestamp: Date; id: string } | null>(null)
  const [isLoadingCached, setIsLoadingCached] = useState(false)
  const [analysisSource, setAnalysisSource] = useState<'cache' | 'new' | null>(null)

  // Load logs
  const loadLogs = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (levelFilter !== 'all') params.set('level', levelFilter)
      if (sourceFilter !== 'all') params.set('source', sourceFilter)
      if (searchTerm) params.set('search', searchTerm)
      params.set('limit', '100')

      const response = await fetch(`/api/v1/logs?${params}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      if (result.error) {
        throw new Error(result.error)
      }
      // Handle nested data structure from Igniter.js
      const data = result.data?.data || result.data
      setLogs(data?.logs || [])
    } catch (err: any) {
      console.error('Error loading logs:', err)
      setError(err.message || 'Erro ao carregar logs')
    } finally {
      setIsLoading(false)
    }
  }, [levelFilter, sourceFilter, searchTerm])

  // Load stats (always uses 'day' period for operational monitoring)
  const loadStats = useCallback(async () => {
    try {
      setIsLoadingStats(true)

      const response = await fetch('/api/v1/logs/stats?period=day', {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      if (!result.error) {
        // Handle nested data structure from Igniter.js
        const data = result.data?.data || result.data
        setStats(data)
      }
    } catch (err) {
      console.error('Error loading stats:', err)
    } finally {
      setIsLoadingStats(false)
    }
  }, [])

  // Load sources
  const loadSources = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/logs/sources', {
        credentials: 'include',
      })
      if (response.ok) {
        const result = await response.json()
        if (!result.error) {
          // Handle nested data structure from Igniter.js
          const data = result.data?.data || result.data
          setSources(data || [])
        }
      }
    } catch (err) {
      console.error('Error loading sources:', err)
    }
  }, [])

  // Start/stop streaming
  const toggleStreaming = useCallback(() => {
    if (isStreaming) {
      // Stop streaming
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      setIsStreaming(false)
    } else {
      // Start streaming
      const eventSource = new EventSource('/api/v1/logs/stream')

      eventSource.onopen = () => {
        console.log('SSE connected')
        setIsStreaming(true)
      }

      eventSource.addEventListener('log', (event) => {
        try {
          const log = JSON.parse(event.data)
          setStreamLogs(prev => [log, ...prev].slice(0, 50))
        } catch (err) {
          console.error('Error parsing log event:', err)
        }
      })

      eventSource.onerror = (error) => {
        console.error('SSE error:', error)
        eventSource.close()
        setIsStreaming(false)
      }

      eventSourceRef.current = eventSource
    }
  }, [isStreaming])

  // Fetch cached analysis from database
  const fetchCachedAnalysis = useCallback(async () => {
    try {
      setIsLoadingCached(true)
      const response = await fetch('/api/v1/logs/analyses?limit=1', {
        credentials: 'include',
      })

      if (!response.ok) return null

      const result = await response.json()
      const data = result.data?.data || result.data

      if (data && data.length > 0) {
        const latest = data[0]
        // Check if analysis is less than 30 minutes old
        const analysisTime = new Date(latest.createdAt)
        const now = new Date()
        const diffMinutes = (now.getTime() - analysisTime.getTime()) / (1000 * 60)

        if (diffMinutes < 30 && latest.summary) {
          // Reconstruct AIAnalysis from database fields
          const aiAnalysisData: AIAnalysis = {
            summary: latest.summary || '',
            patterns: Array.isArray(latest.patterns) ? latest.patterns : [],
            anomalies: Array.isArray(latest.anomalies) ? latest.anomalies : [],
            suggestions: Array.isArray(latest.suggestions) ? latest.suggestions : [],
            metrics: {
              totalLogs: latest.metrics?.totalLogs || 0,
              errorRate: latest.metrics?.errorRate || 0,
              avgResponseTime: latest.metrics?.avgResponseTime || null,
              topSources: latest.metrics?.topSources || [],
            },
            severity: latest.severity || 0,
          }
          return {
            id: latest.id,
            data: aiAnalysisData,
            timestamp: analysisTime,
          }
        }
      }
      return null
    } catch (err) {
      console.error('Error fetching cached analysis:', err)
      return null
    } finally {
      setIsLoadingCached(false)
    }
  }, [])

  // AI Analysis - Check cache first or force new
  const runAIAnalysis = useCallback(async (forceNew: boolean = false) => {
    try {
      setShowAiModal(true)
      setAiError(null)

      // Check cache first unless forcing new analysis
      if (!forceNew) {
        setIsLoadingCached(true)
        const cached = await fetchCachedAnalysis()
        if (cached) {
          setCachedAnalysis(cached)
          setAiAnalysis(cached.data)
          setAnalysisSource('cache')
          setIsLoadingCached(false)
          return
        }
        setIsLoadingCached(false)
      }

      // Reset states for new analysis
      setAiAnalysis(null)
      setCachedAnalysis(null)
      setAnalysisSource('new')
      setIsAnalyzing(true)

      const body: any = { limit: 500 }
      if (levelFilter !== 'all') body.level = levelFilter
      if (sourceFilter !== 'all') body.source = sourceFilter

      const response = await fetch('/api/v1/logs/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      if (!result.error) {
        // Handle nested data structure from Igniter.js
        const data = result.data?.data || result.data
        setAiAnalysis(data)
        setAnalysisSource('new')
      } else {
        throw new Error(result.error || 'Failed to analyze logs')
      }
    } catch (err: any) {
      console.error('Error analyzing logs:', err)
      setAiError(err.message || 'Erro ao analisar logs')
    } finally {
      setIsAnalyzing(false)
    }
  }, [levelFilter, sourceFilter, fetchCachedAnalysis])

  // Analyze single error
  const analyzeError = useCallback(async (logId: string) => {
    try {
      setAnalyzingLogId(logId)

      const response = await fetch(`/api/v1/logs/analyze/${logId}`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      if (!result.error) {
        // Refresh the log to get updated AI fields
        await loadLogs()
        if (selectedLog?.id === logId) {
          setSelectedLog(logs.find(l => l.id === logId) || selectedLog)
        }
      }
    } catch (err) {
      console.error('Error analyzing error:', err)
    } finally {
      setAnalyzingLogId(null)
    }
  }, [loadLogs, selectedLog, logs])

  // Initial load
  useEffect(() => {
    loadLogs()
    loadStats()
    loadSources()
  }, [loadLogs, loadStats, loadSources])

  // Cleanup streaming on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  // Combined logs (stream + static)
  const allLogs = isStreaming ? [...streamLogs, ...logs] : logs
  const filteredLogs = allLogs.filter(log => {
    const matchesSearch = !searchTerm ||
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter
    const matchesSource = sourceFilter === 'all' || log.source === sourceFilter
    return matchesSearch && matchesLevel && matchesSource
  })

  const getSourceIcon = (source: string) => {
    const Icon = sourceIcons[source] || sourceIcons.default
    return <Icon className="h-4 w-4" />
  }

  const errorRate = stats ? ((stats.byLevel.ERROR + stats.byLevel.CRITICAL) / stats.total * 100) : 0

  return (
    <div className="flex flex-col gap-6 pt-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">System Logs</h1>
            {isStreaming && (
              <Badge className="animate-pulse bg-green-500" role="status" aria-live="polite">
                <Radio className="h-3 w-3 mr-1" aria-hidden="true" />
                <span>LIVE</span>
                <span className="sr-only"> - Monitoramento em tempo real ativo</span>
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Monitoramento em tempo real com análise de IA
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={isStreaming ? 'destructive' : 'outline'}
            onClick={toggleStreaming}
          >
            {isStreaming ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Parar Stream
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Iniciar Stream
              </>
            )}
          </Button>
          {/* Only show Atualizar when not streaming (redundant during real-time) */}
          {!isStreaming && (
            <Button variant="outline" onClick={loadLogs}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          )}
          <Button
            onClick={() => runAIAnalysis(false)}
            disabled={isAnalyzing || isLoadingCached || allLogs.length === 0}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            {isAnalyzing || isLoadingCached ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Analisar com IA
          </Button>
        </div>
      </div>

      {/* Stats Cards - Compact */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent" />
          <CardContent className="p-4 relative">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              Total
            </div>
            {isLoadingStats ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-bold">{stats?.total || 0}</p>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-red-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent" />
          <CardContent className="p-4 relative">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlertCircle className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
              Erros
            </div>
            {isLoadingStats ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-bold text-red-500">
                {(stats?.byLevel.ERROR || 0) + (stats?.byLevel.CRITICAL || 0)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-yellow-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 to-transparent" />
          <CardContent className="p-4 relative">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" aria-hidden="true" />
              Avisos
            </div>
            {isLoadingStats ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-bold text-yellow-500">{stats?.byLevel.WARN || 0}</p>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-green-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent" />
          <CardContent className="p-4 relative">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
              Info
            </div>
            {isLoadingStats ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-bold text-green-500">{stats?.byLevel.INFO || 0}</p>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent" />
          <CardContent className="p-4 relative">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              {errorRate > 10 ? (
                <TrendingUp className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
              )}
              Taxa de Erro
            </div>
            {isLoadingStats ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div>
                <p className={cn(
                  "text-2xl font-bold",
                  errorRate > 10 ? "text-red-500" : errorRate > 5 ? "text-yellow-500" : "text-green-500"
                )}>
                  {errorRate.toFixed(1)}%
                </p>
                <Progress value={errorRate} className="mt-1.5 h-1" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filters and Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Logs List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  placeholder="Buscar logs..."
                  aria-label="Buscar logs por mensagem, origem ou ação"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadLogs()}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Select value={levelFilter} onValueChange={setLevelFilter}>
                  <SelectTrigger className="w-[130px]" aria-label="Filtrar por nível de log">
                    <SelectValue placeholder="Nível" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="DEBUG">Debug</SelectItem>
                    <SelectItem value="INFO">Info</SelectItem>
                    <SelectItem value="WARN">Warning</SelectItem>
                    <SelectItem value="ERROR">Error</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[140px]" aria-label="Filtrar por origem do log">
                    <SelectValue placeholder="Origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {sources.map(source => (
                      <SelectItem key={source} value={source}>
                        {source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2" role="status" aria-busy="true" aria-label="Carregando logs">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
                <span className="sr-only">Carregando logs do sistema...</span>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum log encontrado</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm || levelFilter !== 'all' || sourceFilter !== 'all'
                    ? 'Tente ajustar os filtros'
                    : 'Ainda não há logs registrados'}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] sm:h-[500px] lg:h-[600px] pr-4">
                <div className="space-y-2">
                  {filteredLogs.map((log, index) => {
                    const config = levelConfig[log.level]
                    const LevelIcon = config.icon
                    const isNew = isStreaming && index < streamLogs.length

                    return (
                      <div
                        key={log.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedLog(log)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedLog(log)
                          }
                        }}
                        aria-pressed={selectedLog?.id === log.id}
                        aria-label={`Log ${log.level}: ${log.message.substring(0, 50)}${log.message.length > 50 ? '...' : ''}`}
                        className={cn(
                          "p-4 rounded-lg border cursor-pointer transition-all duration-300",
                          "hover:bg-accent hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                          selectedLog?.id === log.id && "ring-2 ring-primary",
                          config.border,
                          isNew && "animate-pulse bg-green-500/5"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn("p-2 rounded-md", config.bg)}>
                            <LevelIcon className={cn("h-4 w-4", config.color)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge
                                variant="outline"
                                className={cn("text-xs font-mono", config.color, config.border)}
                              >
                                {log.level}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {getSourceIcon(log.source)}
                                <span className="ml-1">{log.source}</span>
                              </Badge>
                              {log.action && (
                                <Badge variant="outline" className="text-xs">
                                  {log.action}
                                </Badge>
                              )}
                              {log.duration && (
                                <Badge variant="outline" className="text-xs">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {log.duration}ms
                                </Badge>
                              )}
                              {log.aiAnalysis && (
                                <Badge className="text-xs bg-purple-500/20 text-purple-500 border-purple-500/20">
                                  <Brain className="h-3 w-3 mr-1" />
                                  AI
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium truncate">{log.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(log.timestamp), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
          <CardFooter className="text-sm text-muted-foreground">
            {filteredLogs.length} logs exibidos
            {isStreaming && streamLogs.length > 0 && (
              <span className="ml-2">({streamLogs.length} novos em tempo real)</span>
            )}
          </CardFooter>
        </Card>

        {/* Log Details */}
        <Card className="h-fit sticky top-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detalhes do Log
            </CardTitle>
            <CardDescription>
              {selectedLog ? 'Informações detalhadas' : 'Selecione um log'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedLog ? (
              <ScrollArea className="h-[350px] sm:h-[400px] lg:h-[500px]">
                <div className="space-y-4 pr-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Timestamp</Label>
                    <p className="text-sm font-mono">
                      {new Date(selectedLog.timestamp).toLocaleString('pt-BR')}
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Nível</Label>
                    <div className="mt-1">
                      <Badge className={cn(
                        levelConfig[selectedLog.level].color,
                        levelConfig[selectedLog.level].bg,
                        levelConfig[selectedLog.level].border
                      )}>
                        {selectedLog.level}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Origem</Label>
                    <p className="text-sm flex items-center gap-2">
                      {getSourceIcon(selectedLog.source)}
                      {selectedLog.source}
                      {selectedLog.action && ` / ${selectedLog.action}`}
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Mensagem</Label>
                    <p className="text-sm mt-1">{selectedLog.message}</p>
                  </div>

                  {selectedLog.details && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Detalhes</Label>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{selectedLog.details}</p>
                    </div>
                  )}

                  {selectedLog.requestPath && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Request</Label>
                      <p className="text-sm font-mono mt-1">
                        {selectedLog.requestMethod} {selectedLog.requestPath}
                        {selectedLog.statusCode && ` → ${selectedLog.statusCode}`}
                      </p>
                    </div>
                  )}

                  {selectedLog.duration && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Duração</Label>
                      <p className="text-sm mt-1">{selectedLog.duration}ms</p>
                    </div>
                  )}

                  {selectedLog.stackTrace && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Stack Trace</Label>
                      <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto mt-1 font-mono">
                        {selectedLog.stackTrace}
                      </pre>
                    </div>
                  )}

                  {(selectedLog.context || selectedLog.metadata) && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Contexto</Label>
                      <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto mt-1 font-mono">
                        {JSON.stringify(selectedLog.context || selectedLog.metadata, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* AI Analysis Section */}
                  {selectedLog.aiAnalysis ? (
                    <div className="space-y-3 pt-4 border-t">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-purple-500" />
                        <Label className="text-purple-500">Análise de IA</Label>
                      </div>
                      <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                        <p className="text-sm">{selectedLog.aiAnalysis}</p>
                        {selectedLog.aiSuggestion && (
                          <div className="mt-2 pt-2 border-t border-purple-500/20">
                            <p className="text-xs text-muted-foreground">Sugestão:</p>
                            <p className="text-sm">{selectedLog.aiSuggestion}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (selectedLog.level === 'ERROR' || selectedLog.level === 'CRITICAL') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-4"
                      onClick={() => analyzeError(selectedLog.id)}
                      disabled={analyzingLogId === selectedLog.id}
                    >
                      {analyzingLogId === selectedLog.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Brain className="h-4 w-4 mr-2" />
                      )}
                      Analisar com IA
                    </Button>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  Clique em um log para ver os detalhes
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Analysis Modal */}
      <Dialog open={showAiModal} onOpenChange={(open) => {
        setShowAiModal(open)
        if (!open) {
          // Reset states when closing
          setAiError(null)
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                <Brain className="h-5 w-5 text-purple-500" />
              </div>
              Análise com IA
              {analysisSource === 'cache' && cachedAnalysis && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  Cache de {formatDistanceToNow(cachedAnalysis.timestamp, { addSuffix: true, locale: ptBR })}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="flex items-center justify-between">
              <span>Análise automatizada usando GPT-4o com LangChain</span>
              {analysisSource === 'cache' && !isAnalyzing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runAIAnalysis(true)}
                  className="h-7"
                >
                  <RefreshCcw className="h-3 w-3 mr-1" />
                  Nova Análise
                </Button>
              )}
            </DialogDescription>
          </DialogHeader>

          {isLoadingCached ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-12 w-12 animate-spin text-purple-500" />
              <p className="text-sm text-muted-foreground mt-4">
                Verificando análises em cache...
              </p>
            </div>
          ) : isAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-xl opacity-30 animate-pulse" />
                <Loader2 className="h-16 w-16 animate-spin text-purple-500 relative" />
              </div>
              <p className="text-lg font-medium mt-6">Analisando logs...</p>
              <p className="text-sm text-muted-foreground mt-2">
                A IA está processando padrões e anomalias
              </p>
            </div>
          ) : aiError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{aiError}</AlertDescription>
            </Alert>
          ) : aiAnalysis ? (
            <ScrollArea className="h-[65vh]">
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="summary">Resumo</TabsTrigger>
                  <TabsTrigger value="patterns">Padrões</TabsTrigger>
                  <TabsTrigger value="anomalies">Anomalias</TabsTrigger>
                  <TabsTrigger value="suggestions">Sugestões</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="mt-4 space-y-4">
                  {/* Severity indicator */}
                  <Card className={cn(
                    "border-2",
                    aiAnalysis.severity >= 8 ? "border-red-500 bg-red-500/5" :
                    aiAnalysis.severity >= 5 ? "border-yellow-500 bg-yellow-500/5" :
                    "border-green-500 bg-green-500/5"
                  )}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardDescription>Severidade Geral</CardDescription>
                        <Badge variant={
                          aiAnalysis.severity >= 8 ? 'destructive' :
                          aiAnalysis.severity >= 5 ? 'default' : 'secondary'
                        }>
                          {aiAnalysis.severity}/10
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Progress value={aiAnalysis.severity * 10} className="h-2" />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Resumo Executivo</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed">{aiAnalysis.summary}</p>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card>
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Logs Analisados</p>
                        <p className="text-xl font-bold mt-1">{aiAnalysis.metrics.totalLogs}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Taxa de Erro</p>
                        <p className={cn(
                          "text-xl font-bold mt-1",
                          aiAnalysis.metrics.errorRate > 10 ? "text-red-500" : "text-green-500"
                        )}>
                          {aiAnalysis.metrics.errorRate.toFixed(1)}%
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Tempo Médio</p>
                        <p className="text-xl font-bold mt-1">
                          {aiAnalysis.metrics.avgResponseTime?.toFixed(0) || '-'}ms
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Padrões Detectados</p>
                        <p className="text-xl font-bold mt-1">{aiAnalysis.patterns.length}</p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="patterns" className="mt-4">
                  {aiAnalysis.patterns.length > 0 ? (
                    <div className="space-y-4">
                      {aiAnalysis.patterns.map((pattern, i) => (
                        <Card key={i} className="border-l-4" style={{
                          borderLeftColor: pattern.severity >= 7 ? '#ef4444' :
                            pattern.severity >= 4 ? '#eab308' : '#22c55e'
                        }}>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base">{pattern.type}</CardTitle>
                              <div className="flex gap-2">
                                <Badge variant="outline">{pattern.count}x</Badge>
                                <Badge variant={
                                  pattern.severity >= 7 ? 'destructive' :
                                  pattern.severity >= 4 ? 'default' : 'secondary'
                                }>
                                  Severidade: {pattern.severity}
                                </Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">{pattern.description}</p>
                            {pattern.suggestion && (
                              <div className="mt-3 p-3 bg-muted rounded-lg">
                                <p className="text-xs font-medium text-muted-foreground">Sugestão:</p>
                                <p className="text-sm mt-1">{pattern.suggestion}</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                      <p>Nenhum padrão problemático detectado</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="anomalies" className="mt-4">
                  {aiAnalysis.anomalies.length > 0 ? (
                    <div className="space-y-4">
                      {aiAnalysis.anomalies.map((anomaly, i) => (
                        <Card key={i} className="border-red-500/50 bg-red-500/5">
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                                {anomaly.type}
                              </CardTitle>
                              <Badge variant="destructive">
                                Severidade: {anomaly.severity}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm">{anomaly.description}</p>
                            {anomaly.suggestion && (
                              <div className="mt-3 p-3 bg-background rounded-lg border">
                                <p className="text-xs font-medium text-muted-foreground">Ação Recomendada:</p>
                                <p className="text-sm mt-1">{anomaly.suggestion}</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Shield className="h-12 w-12 mx-auto mb-4 text-green-500" />
                      <p>Nenhuma anomalia detectada</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="suggestions" className="mt-4">
                  {aiAnalysis.suggestions.length > 0 ? (
                    <div className="space-y-3">
                      {aiAnalysis.suggestions.map((suggestion, i) => (
                        <Card key={i}>
                          <CardContent className="pt-4">
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-lg bg-blue-500/10">
                                <Sparkles className="h-4 w-4 text-blue-500" />
                              </div>
                              <p className="text-sm flex-1">{suggestion}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <p>Nenhuma sugestão adicional</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </ScrollArea>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
