"use client"

/**
 * Data hook for the agent Config section. Fetches the org's BYOK keys for a
 * provider and persists the selected key on the project credential.
 *
 * Backend routes are created in parallel — fetch by URL only, never import
 * anything from the server. Degrade gracefully when a route is missing.
 *   - GET   /api/v1/providers/:provider/keys
 *   - PATCH /api/v1/builder/credential/:projectId  { organizationProviderId }
 */

import * as React from "react"
import { getCsrfHeaders } from "@/client/hooks/use-csrf-token"
import type { ProviderKey } from "@/client/components/integracoes/providers-catalog"

export interface ProviderKeyOption {
  /** OrganizationProvider id — persisted via the credential PATCH. */
  id: string
  /** Optional friendly label; falls back to a masked tail. */
  label?: string
  lastFour?: string | null
  isDefault?: boolean
}

export type CredentialSaveState = "idle" | "saving" | "saved" | "error"

function unwrapKeys(value: unknown): ProviderKeyOption[] {
  if (Array.isArray(value)) return value as ProviderKeyOption[]
  if (value && typeof value === "object" && "data" in value) {
    return unwrapKeys((value as { data: unknown }).data)
  }
  return []
}

export interface UseAgentCredentialResult {
  keys: ProviderKeyOption[]
  selectedKey: string
  saveState: CredentialSaveState
  selectKey: (organizationProviderId: string) => Promise<void>
}

export function useAgentCredential(
  projectId: string,
  provider: ProviderKey | null,
  initialKeyId?: string | null,
): UseAgentCredentialResult {
  const [keys, setKeys] = React.useState<ProviderKeyOption[]>([])
  const [selectedKey, setSelectedKey] = React.useState<string>(initialKeyId ?? "")
  const [saveState, setSaveState] = React.useState<CredentialSaveState>("idle")

  React.useEffect(() => {
    if (!provider) return
    let active = true
    void (async () => {
      try {
        const res = await fetch(`/api/v1/providers/${provider}/keys`, {
          credentials: "same-origin",
        })
        if (!res.ok) {
          if (active) setKeys([])
          return
        }
        const json = (await res.json()) as unknown
        if (active) setKeys(unwrapKeys(json))
      } catch {
        if (active) setKeys([])
      }
    })()
    return () => {
      active = false
    }
  }, [provider])

  const selectKey = React.useCallback(
    async (organizationProviderId: string) => {
      setSelectedKey(organizationProviderId)
      setSaveState("saving")
      try {
        const res = await fetch(`/api/v1/builder/credential/${projectId}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            ...getCsrfHeaders(),
          },
          body: JSON.stringify({ organizationProviderId }),
        })
        setSaveState(res.ok ? "saved" : "error")
      } catch {
        setSaveState("error")
      }
    },
    [projectId],
  )

  return { keys, selectedKey, saveState, selectKey }
}
