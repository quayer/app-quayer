/**
 * AI Controller
 * Endpoints for AI-powered features like message suggestions
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { authProcedure } from '@/features/auth/procedures/auth.procedure'
import OpenAI from 'openai'

const suggestionsQuerySchema = z.object({
  input: z.string().min(3).max(500),
  context: z.string().max(5000).optional(),
})

interface AISuggestion {
  id: string
  text: string
  completion: string
}

function parseSuggestions(response: string, currentInput: string): AISuggestion[] {
  const lines = response.split('\n').filter(l => l.includes('SUGESTAO'))

  return lines.slice(0, 3).map((line, index) => {
    const completion = line.replace(/^SUGESTAO\d+:\s*/, '').trim()
    return {
      id: `suggestion-${index}`,
      text: currentInput + completion,
      completion,
    }
  })
}

export const aiController = igniter.controller({
  name: 'AI',
  description: 'AI-powered features for message composition',
  path: '/ai',
  actions: {
    /**
     * GET /api/v1/ai/suggestions
     * Get AI-powered message completion suggestions
     */
    suggestions: igniter.query({
      name: 'Get Suggestions',
      description: 'Get AI-powered message completion suggestions',
      path: '/suggestions',
      query: suggestionsQuerySchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response }) => {
        const { input, context } = request.query as z.infer<typeof suggestionsQuerySchema>

        // Check if OpenAI API key is configured
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
          // Return empty suggestions if not configured (silent fail)
          return response.success({ data: [] })
        }

        try {
          const openai = new OpenAI({ apiKey })

          const prompt = `
Voce e um assistente de atendimento ao cliente via WhatsApp.

CONTEXTO DA CONVERSA:
${context || 'Sem contexto anterior'}

MENSAGEM ATUAL (incompleta):
${input}

Complete a mensagem do atendente. Retorne EXATAMENTE 3 sugestoes.
Cada sugestao deve completar a frase de forma natural e profissional.
Use linguagem brasileira informal mas respeitosa.
NAO use emojis excessivos.
Seja conciso (WhatsApp = mensagens curtas).

Formato OBRIGATORIO:
SUGESTAO1: [completacao]
SUGESTAO2: [completacao]
SUGESTAO3: [completacao]
`

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
            temperature: 0.7,
          })

          const text = completion.choices[0]?.message?.content || ''
          const suggestions = parseSuggestions(text, input)

          return response.success({ data: suggestions })
        } catch (error: any) {
          // Silent fail - return empty suggestions
          console.error('[AI] Suggestions error:', error.message)
          return response.success({ data: [] })
        }
      },
    }),

    /**
     * POST /api/v1/ai/analyze-sentiment
     * Analyze sentiment of a message (for future use)
     */
    analyzeSentiment: igniter.mutation({
      name: 'Analyze Sentiment',
      description: 'Analyze the sentiment of a message',
      path: '/analyze-sentiment',
      method: 'POST',
      body: z.object({
        text: z.string().min(1).max(2000),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response }) => {
        const { text } = request.body

        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
          return response.success({
            data: {
              sentiment: 'neutral',
              score: 0.5,
              confidence: 0,
            }
          })
        }

        try {
          const openai = new OpenAI({ apiKey })

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
              role: 'user',
              content: `Analise o sentimento da seguinte mensagem de cliente e responda APENAS com JSON:

Mensagem: "${text}"

Responda no formato:
{"sentiment": "positive|negative|neutral", "score": 0.0-1.0, "keywords": ["palavra1", "palavra2"]}`,
            }],
            max_tokens: 100,
            temperature: 0.3,
          })

          const resultText = completion.choices[0]?.message?.content || ''

          try {
            const result = JSON.parse(resultText)
            return response.success({ data: result })
          } catch {
            return response.success({
              data: {
                sentiment: 'neutral',
                score: 0.5,
                confidence: 0,
              }
            })
          }
        } catch (error: any) {
          console.error('[AI] Sentiment analysis error:', error.message)
          return response.success({
            data: {
              sentiment: 'neutral',
              score: 0.5,
              confidence: 0,
            }
          })
        }
      },
    }),
  },
})
