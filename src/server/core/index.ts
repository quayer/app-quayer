/**
 * Core Module - Public Exports
 *
 * Authentication, Organizations, Permissions, Security and Platform infrastructure
 */

// Auth
export { authController } from './auth/auth.controller'

// Organizations
export * from './organizations/controllers/organizations.controller'
export * from './organizations/organizations.interfaces'
export * from './organizations/organizations.repository'

// Invitations
export * from './invitations/invitations.interfaces'
export * from './invitations/invitations.schemas'
export * from './invitations/invitations.repository'
export { invitationsController } from './invitations/controllers/invitations.controller'

// Permissions
export { permissionsController } from './permissions/controllers/permissions.controller'
export { permissionsService } from './permissions/permissions.service'
export type { Permission, PermissionAction, PermissionRole } from './permissions/permissions.types'

// Onboarding
export { onboardingController } from './onboarding/controllers/onboarding.controller'

// Device Sessions
export { deviceSessionsController } from './device-sessions/controllers/device-sessions.controller'

// System Settings
export * from './system-settings/system-settings.interfaces'
export * from './system-settings/system-settings.schemas'
export * from './system-settings/system-settings.repository'
export { systemSettingsController } from './system-settings/controllers/system-settings.controller'

// Notifications
export { notificationsController } from './notifications/controllers/notifications.controller'
export { notificationsRepository } from './notifications/notifications.repository'

// Health
export * from './health/controllers/health.controller'

// API Keys
export { apiKeysController } from './api-keys/controllers/api-keys.controller'
export { apiKeysRepository, generateApiKey, hashApiKey } from './api-keys/api-keys.repository'

