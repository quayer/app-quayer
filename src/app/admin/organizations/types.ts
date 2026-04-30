import type { OrganizationWithCount } from '../actions'

export type Organization = OrganizationWithCount & { type: 'pf' | 'pj' }
