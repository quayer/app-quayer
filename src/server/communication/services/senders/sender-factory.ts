import type { BrokerType } from '../../instances/instances.interfaces'
import type { TypedSender } from './sender.interface'

// Lazy-loaded singletons — one instance per broker type
const cache = new Map<string, TypedSender>()

/**
 * Return a `TypedSender` for the given broker type.
 *
 * Instances are cached (singleton per type) so repeated calls are free.
 */
export function getSender(brokerType: BrokerType | string): TypedSender {
  const key = String(brokerType).toLowerCase()

  const cached = cache.get(key)
  if (cached) return cached

  let sender: TypedSender

  switch (key) {
    case 'uazapi': {
      // Dynamic import is avoided here to keep the function sync.
      // The modules are small enough to import at the top — but we import
      // lazily so the factory file itself stays lightweight.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { UazapiSender } = require('./uazapi.sender') as typeof import('./uazapi.sender')
      sender = new UazapiSender()
      break
    }

    case 'cloudapi':
    case 'instagram': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { OficialSender } = require('./oficial.sender') as typeof import('./oficial.sender')
      sender = new OficialSender()
      break
    }

    default:
      throw new Error(`[sender-factory] Unknown broker type: "${brokerType}"`)
  }

  cache.set(key, sender)
  return sender
}
