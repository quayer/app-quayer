"use client"

import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { Stage } from "../types"
import { StageRow } from "./stage-row"

export function StageList({
  stages,
  tokens,
}: {
  stages: Stage[]
  tokens: AppTokens
}) {
  return (
    <Card
      className="overflow-hidden border p-0 shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <CardContent className="flex flex-col gap-0 p-0">
        {stages.map((stage, i) => (
          <StageRow
            key={`${stage.title}-${stage.number}`}
            stage={stage}
            isLast={i === stages.length - 1}
            tokens={tokens}
          />
        ))}
      </CardContent>
    </Card>
  )
}
