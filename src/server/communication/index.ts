/**
 * Communication Module - Public Exports
 *
 * Messages, Instances, Connections, Bots and real-time features
 */

// Messages
export { mediaController } from './messages/controllers/media.controller'
export * from './messages/messages.schemas'
export * from './messages/messages.interfaces'

// Connections
// FIXME: Temporarily disabled - needs migration to igniter.controller()
// export { connectionsController } from './connections/controllers/connections.controller'

// Connection Settings
export { connectionSettingsController } from './connection-settings/controllers/connection-settings.controller'

// Instances
export { instancesController } from './instances/controllers/instances.controller'

// SSE
export { sseController } from './sse/controllers/sse.controller'
