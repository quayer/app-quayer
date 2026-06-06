/**
 * calendar — barrel
 *
 * Google Calendar builtin tools (check_availability / create_event / cancel_event)
 * para o runtime dos agentes WhatsApp. Cada tool resolve a credencial via
 * resolveCalendarAccess(ctx.organizationId) (src/lib/calendar) e degrada
 * graciosamente (success:false 'Agenda não conectada') quando não há agenda.
 *
 * Wiring (feito pelo dono de builtin-tools.ts):
 *   1. import {
 *        createCheckAvailabilityTool,
 *        createCreateEventTool,
 *        createCancelEventTool,
 *      } from './calendar'
 *   2. spread no return de createBuiltinTools(ctx):
 *        check_availability: createCheckAvailabilityTool(ctx),
 *        create_event:       createCreateEventTool(ctx),
 *        cancel_event:       createCancelEventTool(ctx),
 *   3. adicionar 'check_availability', 'create_event', 'cancel_event' a
 *      BUILTIN_TOOL_NAMES.
 *   4. no catálogo (src/server/ai-module/builder/catalog/official-tools.ts),
 *      virar status 'backlog' → 'available' nas 3 entradas já existentes.
 */

export {
  createCheckAvailabilityTool,
  executeCheckAvailability,
  checkAvailabilityInputSchema,
  computeFreeSlots,
} from './check-availability'
export type {
  CheckAvailabilityInput,
  CheckAvailabilityResult,
  AvailabilitySlot,
} from './check-availability'

export {
  createCreateEventTool,
  executeCreateEvent,
  createEventInputSchema,
} from './create-event'
export type { CreateEventInput, CreateEventResult } from './create-event'

export {
  createCancelEventTool,
  executeCancelEvent,
  cancelEventInputSchema,
} from './cancel-event'
export type { CancelEventInput, CancelEventResult } from './cancel-event'

export {
  createListSlotsTool,
  executeListSlots,
  buildWorkingWindows,
  listSlotsInputSchema,
} from './list-slots'
export type { ListSlotsInput, ListSlotsResult, DailyWindow } from './list-slots'

export {
  queryFreeBusy,
  insertEvent,
  deleteEvent,
} from './google-calendar-client'
export type {
  FreeBusyInterval,
  CreatedEvent,
  CreateEventArgs,
} from './google-calendar-client'
