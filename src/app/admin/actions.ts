'use server'

export type AdminInstance = {
  id: string
  name: string
  phoneNumber: string | null
  status: string
  brokerType: string
  createdAt: string
  organization: { id: string; name: string } | null
}

export type UazapiDiscoveryInstance = {
  name: string
  token: string
  phoneNumber: string | null
  status: string
  existsInDb: boolean
}

type ListResult =
  | { success: true; data: AdminInstance[]; pagination: { page: number; limit: number; total: number; totalPages: number }; stats: { total: number; connected: number; disconnected: number; noOrg: number } }
  | { success: false; error: string }

type DiscoverResult =
  | { success: true; data: { instances: UazapiDiscoveryInstance[]; stats: { totalUazapi: number } } }
  | { success: false; error: string }

type SyncResult = { success: boolean; updated: number }
type OrgNamesResult = { success: true; data: { id: string; name: string }[] } | { success: false }
type MutationResult = { success: boolean; error?: string }

export async function listAllInstancesAdminAction(_params: {
  page?: number; limit?: number; search?: string; status?: string
}): Promise<ListResult> {
  return { success: false, error: 'Not implemented' }
}

export async function discoverUazapiInstancesAction(): Promise<DiscoverResult> {
  return { success: false, error: 'Not implemented' }
}

export async function importUazapiInstanceAction(_params: {
  name: string; token: string; phoneNumber?: string
}): Promise<MutationResult> {
  return { success: false, error: 'Not implemented' }
}

export async function deleteInstanceAdminAction(_id: string): Promise<MutationResult> {
  return { success: false, error: 'Not implemented' }
}

export async function syncUazapiStatusAction(): Promise<SyncResult> {
  return { success: false, updated: 0 }
}

export async function listAllOrgNamesAction(): Promise<OrgNamesResult> {
  return { success: false }
}

export async function changeInstanceOrgAction(
  _instanceId: string,
  _orgId: string,
): Promise<MutationResult> {
  return { success: false, error: 'Not implemented' }
}
