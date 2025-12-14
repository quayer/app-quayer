/**
 * System Settings Controller
 *
 * Gerenciamento de configurações globais do sistema
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { adminProcedure } from '@/features/auth/procedures/auth.procedure'
import { systemSettingsRepository } from '../system-settings.repository'
import {
  settingsCategorySchema,
  uazapiSettingsSchema,
  emailSettingsSchema,
  aiSettingsSchema,
  concatenationSettingsSchema,
  oauthSettingsSchema,
  securitySettingsSchema,
  emailTemplateSchema,
  testUazapiConnectionSchema,
  testSmtpConnectionSchema,
  testOpenAIConnectionSchema,
} from '../system-settings.schemas'
import {
  DEFAULT_SETTINGS,
  DEFAULT_EMAIL_TEMPLATES,
  DEFAULT_AI_PROMPTS,
} from '../system-settings.interfaces'

// Helper to get user from auth context
const getAdminUser = (context: any) => context.auth?.session?.user

export const systemSettingsController = igniter.controller({
  name: 'systemSettings',
  path: '/system-settings',
  description: 'System settings management (admin only)',
  actions: {
    // ==========================================
    // GET ALL SETTINGS
    // ==========================================
    getAll: igniter.query({
      name: 'Get All Settings',
      description: 'Get all system settings',
      path: '/',
      method: 'GET',
      use: [adminProcedure()],
      handler: async ({ context, response }) => {
        const settings = await systemSettingsRepository.getAll()
        return response.json({ success: true, data: settings })
      },
    }),

    // ==========================================
    // GET SETTINGS BY CATEGORY
    // ==========================================
    getByCategory: igniter.query({
      name: 'Get Settings by Category',
      description: 'Get settings for a specific category',
      path: '/category/:category',
      method: 'GET',
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        const { category } = request.params as { category: string }
        const settings = await systemSettingsRepository.getByCategory(category as any)
        return response.json({ success: true, data: settings })
      },
    }),

    // ==========================================
    // UPDATE UAZAPI SETTINGS
    // ==========================================
    updateUazapi: igniter.mutation({
      name: 'Update UAZapi Settings',
      description: 'Update UAZapi configuration',
      path: '/uazapi',
      method: 'PUT',
      body: uazapiSettingsSchema,
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        const user = getAdminUser(context)
        await systemSettingsRepository.setCategory('uazapi', request.body, {
          encryptedKeys: ['adminToken'],
          updatedBy: user?.id,
        })

        return response.json({ success: true, message: 'Configurações UAZapi salvas' })
      },
    }),

    // ==========================================
    // UPDATE EMAIL SETTINGS
    // ==========================================
    updateEmail: igniter.mutation({
      name: 'Update Email Settings',
      description: 'Update email/SMTP configuration',
      path: '/email',
      method: 'PUT',
      body: emailSettingsSchema,
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        const user = getAdminUser(context)
        const encryptedKeys = ['resendApiKey']
        if (request.body.smtp?.pass) {
          encryptedKeys.push('smtp')
        }

        await systemSettingsRepository.setCategory('email', request.body, {
          encryptedKeys,
          updatedBy: user?.id,
        })

        return response.json({ success: true, message: 'Configurações de email salvas' })
      },
    }),

    // ==========================================
    // UPDATE AI SETTINGS
    // ==========================================
    updateAI: igniter.mutation({
      name: 'Update AI Settings',
      description: 'Update AI/OpenAI configuration',
      path: '/ai',
      method: 'PUT',
      body: aiSettingsSchema,
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        const user = getAdminUser(context)
        await systemSettingsRepository.setCategory('ai', request.body, {
          encryptedKeys: ['openaiApiKey'],
          updatedBy: user?.id,
        })

        return response.json({ success: true, message: 'Configurações de IA salvas' })
      },
    }),

    // ==========================================
    // UPDATE CONCATENATION SETTINGS
    // ==========================================
    updateConcatenation: igniter.mutation({
      name: 'Update Concatenation Settings',
      description: 'Update message concatenation configuration',
      path: '/concatenation',
      method: 'PUT',
      body: concatenationSettingsSchema,
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        const user = getAdminUser(context)
        await systemSettingsRepository.setCategory('concatenation', request.body, {
          updatedBy: user?.id,
        })

        return response.json({ success: true, message: 'Configurações de concatenação salvas' })
      },
    }),

    // ==========================================
    // UPDATE OAUTH SETTINGS
    // ==========================================
    updateOAuth: igniter.mutation({
      name: 'Update OAuth Settings',
      description: 'Update OAuth/Google configuration',
      path: '/oauth',
      method: 'PUT',
      body: oauthSettingsSchema,
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        const user = getAdminUser(context)
        await systemSettingsRepository.setCategory('oauth', request.body, {
          encryptedKeys: ['googleClientSecret'],
          updatedBy: user?.id,
        })

        return response.json({ success: true, message: 'Configurações OAuth salvas' })
      },
    }),

    // ==========================================
    // UPDATE SECURITY SETTINGS
    // ==========================================
    updateSecurity: igniter.mutation({
      name: 'Update Security Settings',
      description: 'Update security configuration',
      path: '/security',
      method: 'PUT',
      body: securitySettingsSchema,
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        const user = getAdminUser(context)
        await systemSettingsRepository.setCategory('security', request.body, {
          updatedBy: user?.id,
        })

        return response.json({ success: true, message: 'Configurações de segurança salvas' })
      },
    }),

    // ==========================================
    // EMAIL TEMPLATES
    // ==========================================
    getEmailTemplates: igniter.query({
      name: 'Get Email Templates',
      description: 'Get all email templates',
      path: '/email-templates',
      method: 'GET',
      use: [adminProcedure()],
      handler: async ({ context, response }) => {
        // Auto-initialize missing templates on first access
        await systemSettingsRepository.initializeEmailTemplates(DEFAULT_EMAIL_TEMPLATES)

        const templates = await systemSettingsRepository.getEmailTemplates()
        return response.json({ success: true, data: templates })
      },
    }),

    getEmailTemplate: igniter.query({
      name: 'Get Email Template',
      description: 'Get a specific email template by name',
      path: '/email-templates/:name',
      method: 'GET',
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        const { name } = request.params as { name: string }
        const template = await systemSettingsRepository.getEmailTemplate(name)
        return response.json({ success: true, data: template })
      },
    }),

    upsertEmailTemplate: igniter.mutation({
      name: 'Upsert Email Template',
      description: 'Create or update an email template',
      path: '/email-templates',
      method: 'POST',
      body: emailTemplateSchema,
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        const user = getAdminUser(context)
        const template = await systemSettingsRepository.upsertEmailTemplate({
          ...request.body,
          isActive: request.body.isActive ?? true,
          updatedBy: user?.id,
        } as any)

        return response.json({ success: true, data: template, message: 'Template salvo' })
      },
    }),

    deleteEmailTemplate: igniter.mutation({
      name: 'Delete Email Template',
      description: 'Delete an email template',
      path: '/email-templates/:id',
      method: 'DELETE',
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        const { id } = request.params as { id: string }
        await systemSettingsRepository.deleteEmailTemplate(id)
        return response.json({ success: true, message: 'Template deletado' })
      },
    }),

    // ==========================================
    // AI PROMPTS
    // ==========================================
    getAIPrompts: igniter.query({
      name: 'Get AI Prompts',
      description: 'Get all AI prompts',
      path: '/ai-prompts',
      method: 'GET',
      use: [adminProcedure()],
      handler: async ({ context, response }) => {
        // Auto-initialize missing prompts on first access
        await systemSettingsRepository.initializeAIPrompts(DEFAULT_AI_PROMPTS)

        const prompts = await systemSettingsRepository.getAIPrompts()
        return response.json({ success: true, data: prompts })
      },
    }),

    getAIPrompt: igniter.query({
      name: 'Get AI Prompt',
      description: 'Get a specific AI prompt by name',
      path: '/ai-prompts/:name',
      method: 'GET',
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        const { name } = request.params as { name: string }
        const prompt = await systemSettingsRepository.getAIPrompt(name)
        return response.json({ success: true, data: prompt })
      },
    }),

    upsertAIPrompt: igniter.mutation({
      name: 'Upsert AI Prompt',
      description: 'Create or update an AI prompt',
      path: '/ai-prompts',
      method: 'POST',
      body: z.object({
        name: z.string(),
        description: z.string().optional(),
        prompt: z.string(),
        category: z.string().optional(),
        model: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().optional(),
        isActive: z.boolean().optional(),
      }),
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        const user = getAdminUser(context)
        const prompt = await systemSettingsRepository.upsertAIPrompt({
          ...request.body,
          isActive: request.body.isActive ?? true,
          updatedBy: user?.id,
        } as any)

        return response.json({ success: true, data: prompt, message: 'Prompt salvo' })
      },
    }),

    deleteAIPrompt: igniter.mutation({
      name: 'Delete AI Prompt',
      description: 'Delete an AI prompt',
      path: '/ai-prompts/:id',
      method: 'DELETE',
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        const { id } = request.params as { id: string }
        await systemSettingsRepository.deleteAIPrompt(id)
        return response.json({ success: true, message: 'Prompt deletado' })
      },
    }),

    // ==========================================
    // TEST CONNECTIONS
    // ==========================================
    testUazapiConnection: igniter.mutation({
      name: 'Test UAZapi Connection',
      description: 'Test UAZapi API connectivity',
      path: '/test/uazapi',
      method: 'POST',
      body: testUazapiConnectionSchema,
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        try {
          const apiResponse = await fetch(`${request.body.baseUrl}/instance/list`, {
            headers: {
              'Authorization': `Bearer ${request.body.adminToken}`,
              'Content-Type': 'application/json',
            },
          })

          if (!apiResponse.ok) {
            throw new Error(`HTTP ${apiResponse.status}`)
          }

          return response.json({ success: true, message: 'Conexão UAZapi OK' })
        } catch (error: any) {
          return response.json({
            success: false,
            error: `Falha na conexão: ${error.message}`,
          })
        }
      },
    }),

    testSmtpConnection: igniter.mutation({
      name: 'Test SMTP Connection',
      description: 'Test SMTP/email connectivity',
      path: '/test/smtp',
      method: 'POST',
      body: testSmtpConnectionSchema,
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        try {
          const nodemailer = await import('nodemailer')
          const transporter = nodemailer.createTransport({
            host: request.body.host,
            port: request.body.port,
            secure: request.body.secure,
            auth: {
              user: request.body.user,
              pass: request.body.pass,
            },
          })

          await transporter.verify()
          return response.json({ success: true, message: 'Conexão SMTP OK' })
        } catch (error: any) {
          return response.json({
            success: false,
            error: `Falha SMTP: ${error.message}`,
          })
        }
      },
    }),

    testOpenAIConnection: igniter.mutation({
      name: 'Test OpenAI Connection',
      description: 'Test OpenAI API connectivity',
      path: '/test/openai',
      method: 'POST',
      body: testOpenAIConnectionSchema,
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        try {
          const apiResponse = await fetch('https://api.openai.com/v1/models', {
            headers: {
              'Authorization': `Bearer ${request.body.apiKey}`,
            },
          })

          if (!apiResponse.ok) {
            const error = await apiResponse.json().catch(() => ({}))
            throw new Error(error.error?.message || `HTTP ${apiResponse.status}`)
          }

          return response.json({ success: true, message: 'Conexão OpenAI OK' })
        } catch (error: any) {
          return response.json({
            success: false,
            error: `Falha OpenAI: ${error.message}`,
          })
        }
      },
    }),

    // ==========================================
    // INITIALIZE DEFAULTS
    // ==========================================
    initializeDefaults: igniter.mutation({
      name: 'Initialize Defaults',
      description: 'Initialize default system settings',
      path: '/initialize',
      method: 'POST',
      use: [adminProcedure()],
      handler: async ({ context, response }) => {
        await systemSettingsRepository.initializeDefaults(DEFAULT_SETTINGS)
        await systemSettingsRepository.initializeEmailTemplates(DEFAULT_EMAIL_TEMPLATES)
        await systemSettingsRepository.initializeAIPrompts(DEFAULT_AI_PROMPTS)

        return response.json({ success: true, message: 'Configurações padrão inicializadas' })
      },
    }),

    // ==========================================
    // SYSTEM INFO
    // ==========================================
    getSystemInfo: igniter.query({
      name: 'Get System Info',
      description: 'Get system runtime information',
      path: '/info',
      method: 'GET',
      use: [adminProcedure()],
      handler: async ({ context, response }) => {
        return response.json({
          success: true,
          data: {
            nodeEnv: process.env.NODE_ENV || 'development',
            appVersion: process.env.npm_package_version || '1.0.0',
            appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
          },
        })
      },
    }),
  },
})
