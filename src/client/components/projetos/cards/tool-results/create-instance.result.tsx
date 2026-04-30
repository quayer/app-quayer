"use client"

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { InstanceCard, InstanceListCard } from "../instance-card"
import { safeGet } from "./index"

// ---------------------------------------------------------------------------
// create_whatsapp_instance
// ---------------------------------------------------------------------------

interface CreateInstanceResultProps {
  args: unknown
  result: unknown
  tokens: AppTokens
}

/**
 * Adapter for the `create_whatsapp_instance` tool result.
 */
export function CreateInstanceResult({
  args,
  result,
  tokens,
}: CreateInstanceResultProps) {
  return (
    <InstanceCard
      instanceId={safeGet<string>(result, "instanceId") ?? ""}
      name={safeGet<string>(args, "name") ?? "Nova instancia"}
      status="disconnected"
      shareLink={safeGet<string>(result, "shareLink")}
      qrCodeBase64={safeGet<string>(result, "qrCodeBase64") || undefined}
      tokens={tokens}
    />
  )
}

// ---------------------------------------------------------------------------
// list_whatsapp_instances
// ---------------------------------------------------------------------------

interface ListInstancesResultProps {
  result: unknown
  tokens: AppTokens
}

/**
 * Adapter for the `list_whatsapp_instances` tool result.
 */
export function ListInstancesResult({
  result,
  tokens,
}: ListInstancesResultProps) {
  const instances =
    safeGet<
      Array<{
        id: string
        name: string
        phoneNumber?: string | null
        status: string
      }>
    >(result, "instances") ?? []

  return <InstanceListCard instances={instances} tokens={tokens} />
}
