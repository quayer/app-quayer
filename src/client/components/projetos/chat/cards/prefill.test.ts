/**
 * Tests for the pure prefill helper (precedência FR-02 + proposta tardia FR-23).
 *
 * Hermetic: no DB, no React, no DOM — the helpers are pure. We drive them with
 * crafted `capturedProposals` slices + a frozen mount snapshot.
 *
 * Covers:
 *   - resolveField: as 3 precedências (owned > proposed > default)
 *   - resolveField: owned vazio-mas-confirmado ("") ainda vence a proposta
 *   - captureProposalSnapshot: null por domínio quando não há proposta no mount
 *   - detectLateProposals (FR-23): proposta nova/alterada após o mount é detectada
 *     SEM re-prefillar; mesma proposta (nova ref, mesmo conteúdo) NÃO dispara;
 *     proposta que sumiu NÃO dispara.
 */

import { describe, it, expect } from "vitest"

import {
  resolveField,
  captureProposalSnapshot,
  detectLateProposals,
  readProposal,
} from "./prefill"
import type { BuilderState } from "@/server/ai-module/builder/cards/builder-state"

// ---------------------------------------------------------------------------
// Fixtures — só o slice `capturedProposals` (o helper só lê isso via Pick<>).
// ---------------------------------------------------------------------------

type CapturedSlice = Pick<BuilderState, "capturedProposals">

const NO_PROPOSALS: CapturedSlice = { capturedProposals: undefined }

const PERSONA_PROPOSAL: CapturedSlice = {
  capturedProposals: { persona: { name: "Aurora", tone: "acolhedor" } },
}

// ---------------------------------------------------------------------------
// resolveField — as 3 precedências (FR-02)
// ---------------------------------------------------------------------------

describe("resolveField — precedência owned > proposed > default", () => {
  it("owned vence proposta e default", () => {
    const field = resolveField({
      owned: "Confirmado",
      proposed: "Sugerido",
      fallback: "Default",
    })
    expect(field).toEqual({ value: "Confirmado", origin: "owned" })
  })

  it("proposta vence default quando não há owned", () => {
    const field = resolveField({
      owned: undefined,
      proposed: "Sugerido",
      fallback: "Default",
    })
    expect(field).toEqual({ value: "Sugerido", origin: "proposed" })
  })

  it("default quando não há owned nem proposta", () => {
    const field = resolveField({
      owned: undefined,
      proposed: undefined,
      fallback: "Default",
    })
    expect(field).toEqual({ value: "Default", origin: "default" })
  })

  it("owned vazio-mas-confirmado ('') ainda vence a proposta", () => {
    // "Configure por exceção": o usuário já decidiu (mesmo deixando em branco),
    // então a sugestão não deve re-aparecer. Sem badge "sugerido".
    const field = resolveField({
      owned: "",
      proposed: "Sugerido",
      fallback: "Default",
    })
    expect(field).toEqual({ value: "", origin: "owned" })
  })

  it("só a origem 'proposed' deve pintar o badge (contrato de origem)", () => {
    const proposed = resolveField({
      owned: undefined,
      proposed: ["A", "B"],
      fallback: [],
    })
    const owned = resolveField({
      owned: ["X"],
      proposed: ["A", "B"],
      fallback: [],
    })
    expect(proposed.origin).toBe("proposed")
    expect(owned.origin).toBe("owned")
  })
})

// ---------------------------------------------------------------------------
// readProposal / captureProposalSnapshot
// ---------------------------------------------------------------------------

describe("readProposal — leitura segura por domínio", () => {
  it("devolve a proposta quando presente", () => {
    expect(readProposal(PERSONA_PROPOSAL, "persona")).toEqual({
      name: "Aurora",
      tone: "acolhedor",
    })
  })

  it("devolve undefined quando o namespace está ausente (state legado)", () => {
    expect(readProposal(NO_PROPOSALS, "persona")).toBeUndefined()
    expect(readProposal(NO_PROPOSALS, "services")).toBeUndefined()
  })
})

describe("captureProposalSnapshot — congela o mount", () => {
  it("null em todos os domínios quando não há proposta nenhuma", () => {
    const snapshot = captureProposalSnapshot(NO_PROPOSALS)
    expect(snapshot.persona).toBeNull()
    expect(snapshot.services).toBeNull()
    expect(snapshot.hours).toBeNull()
    expect(snapshot.pricing).toBeNull()
    expect(snapshot.handoff).toBeNull()
    expect(snapshot.activation).toBeNull()
  })

  it("serializa só os domínios com proposta no mount", () => {
    const snapshot = captureProposalSnapshot(PERSONA_PROPOSAL)
    expect(snapshot.persona).not.toBeNull()
    expect(snapshot.services).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// detectLateProposals — proposta tardia (FR-23)
// ---------------------------------------------------------------------------

describe("detectLateProposals — proposta tardia NÃO re-prefilla (FR-23)", () => {
  it("detecta proposta que chegou DEPOIS do mount (campo já montado)", () => {
    // Mount sem proposta de persona → o campo montou owned/default.
    const mount = captureProposalSnapshot(NO_PROPOSALS)
    // A conversa propôs persona DEPOIS do mount.
    const late = detectLateProposals(PERSONA_PROPOSAL, mount)
    expect(late).toEqual([
      { domain: "persona", value: { name: "Aurora", tone: "acolhedor" } },
    ])
  })

  it("NÃO dispara para a MESMA proposta já presente no mount (nova ref, mesmo conteúdo)", () => {
    // Esta é a garantia de "não re-prefillar / não sobrescrever digitação": um
    // refetch do readiness que devolve a mesma proposta (nova referência de
    // objeto) jamais reapresenta a sugestão.
    const mount = captureProposalSnapshot(PERSONA_PROPOSAL)
    const liveRefetch: CapturedSlice = {
      // Conteúdo idêntico, ordem de chaves trocada + nova referência.
      capturedProposals: { persona: { tone: "acolhedor", name: "Aurora" } },
    }
    expect(detectLateProposals(liveRefetch, mount)).toEqual([])
  })

  it("detecta quando o CONTEÚDO da proposta muda após o mount", () => {
    const mount = captureProposalSnapshot(PERSONA_PROPOSAL)
    const changed: CapturedSlice = {
      capturedProposals: { persona: { name: "Aurora", tone: "formal" } },
    }
    const late = detectLateProposals(changed, mount)
    expect(late).toHaveLength(1)
    expect(late[0]).toEqual({
      domain: "persona",
      value: { name: "Aurora", tone: "formal" },
    })
  })

  it("NÃO dispara quando a proposta SUMIU desde o mount (nada a sugerir)", () => {
    const mount = captureProposalSnapshot(PERSONA_PROPOSAL)
    expect(detectLateProposals(NO_PROPOSALS, mount)).toEqual([])
  })

  it("reporta apenas os domínios com proposta tardia, ignorando os inalterados", () => {
    // Mount: persona presente, demais ausentes.
    const mount = captureProposalSnapshot(PERSONA_PROPOSAL)
    // Vivo: persona inalterada + services NOVO.
    const live: CapturedSlice = {
      capturedProposals: {
        persona: { name: "Aurora", tone: "acolhedor" },
        services: { offered: ["corte", "barba"] },
      },
    }
    const late = detectLateProposals(live, mount)
    expect(late).toEqual([
      { domain: "services", value: { offered: ["corte", "barba"] } },
    ])
  })
})
