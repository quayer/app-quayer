import { database } from '@/services/database'
import crypto from 'crypto'
import type {
  SettingsCategory,
  SystemSetting,
  EmailTemplate,
  AIPromptConfig,
  DEFAULT_SETTINGS,
  DEFAULT_EMAIL_TEMPLATES,
  DEFAULT_AI_PROMPTS,
} from './system-settings.interfaces'

// Encryption key from env
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production'

// Simple encryption for sensitive values
function encrypt(text: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

function decrypt(text: string): string {
  try {
    const [ivHex, encrypted] = text.split(':')
    if (!ivHex || !encrypted) return text // Not encrypted
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    return text // Return original if decryption fails
  }
}

export const systemSettingsRepository = {
  // Get all settings by category
  async getByCategory(category: SettingsCategory): Promise<Record<string, any>> {
    const settings = await database.systemSettings.findMany({
      where: { category },
    })

    const result: Record<string, any> = {}
    for (const setting of settings) {
      const value = setting.encrypted ? decrypt(setting.value) : setting.value
      try {
        result[setting.key] = JSON.parse(value)
      } catch {
        result[setting.key] = value
      }
    }
    return result
  },

  // Get single setting
  async get(category: SettingsCategory, key: string): Promise<any | null> {
    const setting = await database.systemSettings.findUnique({
      where: { category_key: { category, key } },
    })

    if (!setting) return null

    const value = setting.encrypted ? decrypt(setting.value) : setting.value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  },

  // Set single setting
  async set(
    category: SettingsCategory,
    key: string,
    value: any,
    options?: { encrypted?: boolean; description?: string; updatedBy?: string }
  ): Promise<SystemSetting> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
    const finalValue = options?.encrypted ? encrypt(stringValue) : stringValue

    const setting = await database.systemSettings.upsert({
      where: { category_key: { category, key } },
      create: {
        category,
        key,
        value: finalValue,
        encrypted: options?.encrypted ?? false,
        description: options?.description,
        updatedBy: options?.updatedBy,
      },
      update: {
        value: finalValue,
        encrypted: options?.encrypted ?? false,
        description: options?.description,
        updatedBy: options?.updatedBy,
      },
    })

    return setting as SystemSetting
  },

  // Bulk set settings for a category
  async setCategory(
    category: SettingsCategory,
    settings: Record<string, any>,
    options?: { encryptedKeys?: string[]; updatedBy?: string }
  ): Promise<void> {
    const operations = Object.entries(settings).map(([key, value]) => {
      const shouldEncrypt = options?.encryptedKeys?.includes(key) ?? false
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
      const finalValue = shouldEncrypt ? encrypt(stringValue) : stringValue

      return database.systemSettings.upsert({
        where: { category_key: { category, key } },
        create: {
          category,
          key,
          value: finalValue,
          encrypted: shouldEncrypt,
          updatedBy: options?.updatedBy,
        },
        update: {
          value: finalValue,
          encrypted: shouldEncrypt,
          updatedBy: options?.updatedBy,
        },
      })
    })

    await database.$transaction(operations)
  },

  // Delete setting
  async delete(category: SettingsCategory, key: string): Promise<void> {
    await database.systemSettings.delete({
      where: { category_key: { category, key } },
    }).catch(() => {}) // Ignore if not exists
  },

  // Get all settings (for admin dashboard)
  async getAll(): Promise<Record<SettingsCategory, Record<string, any>>> {
    const settings = await database.systemSettings.findMany()

    const result: Record<string, Record<string, any>> = {
      uazapi: {},
      email: {},
      ai: {},
      concatenation: {},
      oauth: {},
      security: {},
      system: {},
    }

    for (const setting of settings) {
      const value = setting.encrypted ? decrypt(setting.value) : setting.value
      try {
        result[setting.category][setting.key] = JSON.parse(value)
      } catch {
        result[setting.category][setting.key] = value
      }
    }

    return result as Record<SettingsCategory, Record<string, any>>
  },

  // Email Templates
  async getEmailTemplates(): Promise<EmailTemplate[]> {
    return database.emailTemplate.findMany({
      orderBy: { name: 'asc' },
    }) as Promise<EmailTemplate[]>
  },

  async getEmailTemplate(name: string): Promise<EmailTemplate | null> {
    return database.emailTemplate.findUnique({
      where: { name },
    }) as Promise<EmailTemplate | null>
  },

  async upsertEmailTemplate(
    template: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<EmailTemplate> {
    return database.emailTemplate.upsert({
      where: { name: template.name },
      create: template,
      update: template,
    }) as Promise<EmailTemplate>
  },

  async deleteEmailTemplate(id: string): Promise<void> {
    await database.emailTemplate.delete({ where: { id } })
  },

  // AI Prompts
  async getAIPrompts(): Promise<AIPromptConfig[]> {
    return database.aIPrompt.findMany({
      orderBy: { name: 'asc' },
    }) as Promise<AIPromptConfig[]>
  },

  async getAIPrompt(name: string): Promise<AIPromptConfig | null> {
    return database.aIPrompt.findUnique({
      where: { name },
    }) as Promise<AIPromptConfig | null>
  },

  async upsertAIPrompt(
    prompt: Omit<AIPromptConfig, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ): Promise<AIPromptConfig> {
    return database.aIPrompt.upsert({
      where: { name: prompt.name },
      create: prompt,
      update: prompt,
    }) as Promise<AIPromptConfig>
  },

  async incrementAIPromptUsage(name: string): Promise<void> {
    await database.aIPrompt.update({
      where: { name },
      data: { usageCount: { increment: 1 } },
    }).catch(() => {})
  },

  async deleteAIPrompt(id: string): Promise<void> {
    await database.aIPrompt.delete({ where: { id } })
  },

  // Initialize default settings
  async initializeDefaults(defaults: typeof DEFAULT_SETTINGS): Promise<void> {
    // Check if already initialized
    const existing = await database.systemSettings.count()
    if (existing > 0) return

    // UAZapi
    await this.setCategory('uazapi', defaults.uazapi, {
      encryptedKeys: ['adminToken'],
    })

    // Email
    await this.setCategory('email', defaults.email, {
      encryptedKeys: ['resendApiKey'],
    })

    // AI
    await this.setCategory('ai', defaults.ai, {
      encryptedKeys: ['openaiApiKey'],
    })

    // Concatenation
    await this.setCategory('concatenation', defaults.concatenation)

    // OAuth
    await this.setCategory('oauth', defaults.oauth, {
      encryptedKeys: ['googleClientSecret'],
    })

    // Security
    await this.setCategory('security', defaults.security)
  },

  // Initialize default email templates (uses upsert to ensure all templates exist)
  async initializeEmailTemplates(templates: typeof DEFAULT_EMAIL_TEMPLATES): Promise<void> {
    for (const template of templates) {
      // Use upsert to create missing templates without overwriting existing ones
      await database.emailTemplate.upsert({
        where: { name: template.name },
        create: {
          ...template,
          isActive: true,
        },
        update: {}, // Don't update if exists - preserve user edits
      })
    }
  },

  // Initialize default AI prompts (uses upsert to ensure all prompts exist)
  async initializeAIPrompts(prompts: typeof DEFAULT_AI_PROMPTS): Promise<void> {
    for (const prompt of prompts) {
      // Use upsert to create missing prompts without overwriting existing ones
      await database.aIPrompt.upsert({
        where: { name: prompt.name },
        create: {
          ...prompt,
          isActive: true,
        },
        update: {}, // Don't update if exists - preserve user edits
      })
    }
  },
}
