"use client"

/**
 * Data hook for the agent Config section. Fetches the org's BYOK keys for a
 * provider, carrega a chave atualmente vinculada ao agente e persiste a
 * seleção no projeto.
 *
 * Backend é consumido só por URL — nunca importar nada do server. Degrada
 * graciosamente quando uma rota está indisponível.
 *   - GET   /api/v1/providers/:provider/keys
 *   - GET   /api/v1/builder/credential/:projectId
 *   - PATCH /api/v1/builder/credential/:projectId  { organizationProviderId }
 */

import * as React from "react"
import { getCsrfHeaders } from "@/client/hooks/use-csrf-token"
import type { ProviderKey } from "@/client/components/integracoes/providers-catalog"

/** Valor sentinela do dropdown: sem vínculo → fallback padrão da organização. */
export const ORG_DEFAULT_KEY = "__org_default__"

export interface ProviderKeyOption {
  /** OrganizationProvider id — persisted via the credential PATCH. */
  id: string
  /** Rótulo dado pelo usuário (OrganizationProvider.name). */
  name?: string
  lastFour?: string | null
  isPrimary?: boolean
  /** Chaves inativas aparecem marcadas, mas não são selecionáveis. */
  isActive?: boolean
}

export type CredentialSaveState = "idle" | "saving" | "saved" | "error"

function unwrapData(value: unknown): unknown {
  if (value && typeof value === "object" && "data" in value) {
    return unwrapData((value as { data: unknown }).data)
  }
  return value
}

function unwrapKeys(value: unknown): ProviderKeyOption[] {
  const data = unwrapData(value)
  return Array.isArray(data) ? (data as ProviderKeyOption[]) : []
}

export interface UseAgentCredentialResult {
  keys: ProviderKeyOption[]
  selectedKey: string
  saveState: CredentialSaveState
  selectKey: (value: string) => Promise<void>
}

export function useAgentCredential(
  projectId: string,
  provider: ProviderKey | null,
): UseAgentCredentialResult {
  const [keys, setKeys] = React.useState<ProviderKeyOption[]>([])
  const [selectedKey, setSelectedKey] = React.useState<string>("")
  const [saveState, setSaveState] = React.useState<CredentialSaveState>("idle")

  // Última requisição vence — uma resposta atrasada não sobrescreve a seleção
  // mais recente nem reverte para um estado antigo.
  const requestSeq = React.useRef(0)
  // Depois que o usuário mexe no dropdown, o fetch inicial não pode clobber.
  const userTouched = React.useRef(false)
  // Espelho do selectedKey para rollback no handler (sem ler ref no render).
  const selectedKeyRef = React.useRef("")
  React.useEffect(() => {
    selectedKeyRef.current = selectedKey
  }, [selectedKey])

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

  // Vínculo atual persistido no agente — o dropdown abre mostrando a chave
  // que o runtime realmente usa (ou "Padrão da organização" quando sem vínculo).
  React.useEffect(() => {
    let active = true
    void (async () => {
      try {
        const res = await fetch(`/api/v1/builder/credential/${projectId}`, {
          credentials: "same-origin",
        })
        if (!res.ok) return
        const json = unwrapData((await res.json()) as unknown) as {
          organizationProviderId?: string | null
        } | null
        if (!active || userTouched.current) return
        setSelectedKey(json?.organizationProviderId ?? ORG_DEFAULT_KEY)
      } catch {
        // rota indisponível — mantém o placeholder
      }
    })()
    return () => {
      active = false
    }
  }, [projectId])

  const selectKey = React.useCallback(
    async (value: string) => {
      userTouched.current = true
      const previous = selectedKeyRef.current
      const seq = ++requestSeq.current
      setSelectedKey(value)
      setSaveState("saving")
      try {
        const res = await fetch(`/api/v1/builder/credential/${projectId}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            ...getCsrfHeaders(),
          },
          body: JSON.stringify({
            organizationProviderId: value === ORG_DEFAULT_KEY ? null : value,
          }),
        })
        if (seq !== requestSeq.current) return
        if (res.ok) {
          setSaveState("saved")
        } else {
          // Rollback: a seleção otimista não foi salva — volta ao que valia.
          setSelectedKey(previous)
          setSaveState("error")
        }
      } catch {
        if (seq !== requestSeq.current) return
        setSelectedKey(previous)
        setSaveState("error")
      }
    },
    [projectId],
  )

  return { keys, selectedKey, saveState, selectKey }
}
