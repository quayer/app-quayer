/**
 * Prompt Section Checklist — template ↔ validator alignment tests
 *
 * Anti-regression for the historical writer/validator mismatch: the writer
 * template used to emit only 5 sections while the anatomy validator demanded
 * 10, so EVERY generated prompt failed validation. These tests pin the
 * contract from both sides of the shared checklist:
 *
 *   1. The writer template contains a heading + placeholder for every
 *      required checklist section (writer side).
 *   2. A prompt produced by filling the template with complete, hint-compliant
 *      content PASSES the anatomy validator AND the full validatePrompt
 *      pipeline with zero errors (the core mismatch regression).
 *   3. The legacy 5-section shape FAILS validation (proves the validator
 *      still demands the full anatomy — the fix was on the writer side).
 *   4. The writer's section parser round-trips the filled template.
 */

import { describe, it, expect } from 'vitest'
import {
  REQUIRED_PROMPT_SECTIONS,
  OPTIONAL_PROMPT_SECTIONS,
  PROMPT_SECTION_KEYS,
  type PromptSectionKey,
} from './prompt-section-checklist'
import { PROMPT_ANATOMY_TEMPLATE } from './prompt-anatomy'
import { validateAnatomy } from '../validators/whatsapp-prompt-anatomy'
import { validatePrompt } from '../validators'
import { parsePromptSections } from '../sub-agents/prompt-writer/prompt-writer.sub-agent'

// ---------------------------------------------------------------------------
// Fixture — realistic per-section content following each writerHint
// (mirrors what the sub-LLM is instructed to produce with complete data)
// ---------------------------------------------------------------------------

const FILLED_SECTIONS: Record<PromptSectionKey, string> = {
  papel:
    'Você é a Lia, atendente virtual da Clínica Dental Sorriso, especializada em agendamentos odontológicos. Você NÃO realiza diagnósticos nem prescreve tratamentos — apenas orienta e agenda.',
  objetivo:
    'Ajudar pacientes a tirar dúvidas sobre serviços da clínica e agendar consultas. Missão cumprida quando o paciente confirma o agendamento ou é encaminhado ao time humano.',
  tom:
    'Tom de voz cordial, direto e acolhedor. Exemplo bom: "Que ótimo! Quando prefere vir?" Exemplo ruim: "De acordo com minhas instruções não posso." Linguagem proibida: "Infelizmente", "Como IA".',
  comunicacao:
    'Uma pergunta por vez — nunca envie múltiplas questões na mesma mensagem. No máximo 3 linhas por mensagem. Retry progressivo: na tentativa 1 reformule a pergunta; na tentativa 2 ofereça atendimento humano. Emojis com moderação.',
  ferramentas:
    '- listar_servicos: quando o paciente perguntar sobre procedimentos ou preços\n- criar_agendamento: quando o paciente confirmar data e horário\n- transfer_to_human: quando houver urgência ou caso fora do escopo\n\nSEMPRE usar listar_servicos antes de criar_agendamento para garantir serviceId fresco.',
  regras:
    'SEMPRE confirmar nome e telefone antes de agendar.\nNUNCA inventar disponibilidade de horário — use listar_servicos.\nNUNCA prometer resultado clínico ou prazo de cura.',
  fluxo:
    'Etapa 1: saudar o paciente e identificar a necessidade\nEtapa 2: apresentar opções via listar_servicos\nEtapa 3: confirmar data, horário e dados do paciente\nEtapa 4: criar_agendamento e confirmar com o paciente',
  gatilhos:
    'Fora do escopo: reclamações sobre tratamentos já realizados, urgências médicas → acionar humano imediatamente. Fallback: se não entender após 2 tentativas, reformule a pergunta de forma mais simples antes de transferir.',
  limitacoes:
    'Não responde sobre financiamento, convênios ou planos — encaminhar para a recepção. Não atende fora do escopo odontológico. O que não é do escopo da clínica vai para humano.',
  encerramento:
    'Após criar_agendamento → confirmar dados e encerrar: "Agendamento confirmado! Até logo." FIM.\nApós acionar humano → montar resumo de handoff com nome, interesse e objetivo, enviar e parar de responder. FIM.',
}

/** Fill the canonical template exactly like the sub-LLM is instructed to. */
function fillTemplate(sections: Record<PromptSectionKey, string>): string {
  let prompt = PROMPT_ANATOMY_TEMPLATE
  for (const key of PROMPT_SECTION_KEYS) {
    prompt = prompt.replace(`{{${key}}}`, sections[key])
  }
  return prompt
}

/** The pre-fix legacy shape: only 5 sections. Must NOT pass validation. */
const LEGACY_5_SECTION_PROMPT = `# Papel
${FILLED_SECTIONS.papel}

# Objetivo
${FILLED_SECTIONS.objetivo}

# Regras de conduta
- Seja educado e direto.
- Confirme horário antes de finalizar.

# Limitações
${FILLED_SECTIONS.limitacoes}

# Formato de resposta
Respostas curtas, em pt-BR, até 3 frases, tom informal e acolhedor.`

// ---------------------------------------------------------------------------
// 1. Template completeness (writer side)
// ---------------------------------------------------------------------------

describe('PROMPT_ANATOMY_TEMPLATE — derived from the shared checklist', () => {
  it('contains a heading + placeholder for every required section, in order', () => {
    let cursor = -1
    for (const section of REQUIRED_PROMPT_SECTIONS) {
      const headingIdx = PROMPT_ANATOMY_TEMPLATE.indexOf(`# ${section.heading}`)
      const placeholderIdx = PROMPT_ANATOMY_TEMPLATE.indexOf(`{{${section.key}}}`)
      expect(headingIdx, `heading de ${section.name}`).toBeGreaterThan(cursor)
      expect(placeholderIdx, `placeholder de ${section.name}`).toBeGreaterThan(
        headingIdx,
      )
      cursor = placeholderIdx
    }
  })

  it('has exactly the 10 checklist placeholders (no extras, no leftovers)', () => {
    const placeholders = [...PROMPT_ANATOMY_TEMPLATE.matchAll(/\{\{(\w+)\}\}/g)].map(
      (m) => m[1],
    )
    expect(placeholders).toEqual([...PROMPT_SECTION_KEYS])
  })

  it('every template heading is recognized by its own headingPattern (parser side)', () => {
    for (const section of REQUIRED_PROMPT_SECTIONS) {
      expect(
        section.headingPattern.test(`# ${section.heading}`),
        `headingPattern de ${section.name}`,
      ).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. The core anti-regression: filled template PASSES the validator
// ---------------------------------------------------------------------------

describe('filled template ↔ validator alignment (mismatch anti-regression)', () => {
  const filled = fillTemplate(FILLED_SECTIONS)

  it('passes validateAnatomy with zero error-severity issues', () => {
    const result = validateAnatomy(filled)
    const errors = result.issues.filter((i) => i.severity === 'error')
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([])
    expect(result.pass).toBe(true)
  })

  it('passes the FULL validatePrompt pipeline (anatomy+blacklist+ambiguity+journey)', () => {
    const result = validatePrompt(filled, [
      'listar_servicos',
      'criar_agendamento',
      'transfer_to_human',
    ])
    const errors = result.issues.filter((i) => i.severity === 'error')
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([])
    expect(result.pass).toBe(true)
  })

  it('every required detectPattern matches the filled prompt individually', () => {
    for (const section of REQUIRED_PROMPT_SECTIONS) {
      expect(
        section.detectPattern.test(filled),
        `detectPattern de ${section.name}`,
      ).toBe(true)
    }
  })

  it('round-trips through the writer section parser (missing = [])', () => {
    const { sections, missing } = parsePromptSections(filled)
    expect(missing).toEqual([])
    for (const key of PROMPT_SECTION_KEYS) {
      // toContain: the last section's body also carries the trailing
      // FORMAT_TAGS comment from the template skeleton.
      expect(sections[key]).toContain(FILLED_SECTIONS[key])
    }
    // Legacy frontend alias preserved.
    expect(sections.formato).toBe(sections.comunicacao)
  })
})

// ---------------------------------------------------------------------------
// 3. Legacy 5-section shape must still FAIL (validator unchanged)
// ---------------------------------------------------------------------------

describe('legacy 5-section prompt (pre-fix shape)', () => {
  it('fails validateAnatomy — proves the fix was widening the writer, not loosening the validator', () => {
    const result = validateAnatomy(LEGACY_5_SECTION_PROMPT)
    expect(result.pass).toBe(false)
    const missingNames = result.issues
      .filter((i) => i.severity === 'error')
      .map((i) => i.message)
      .join('\n')
    expect(missingNames).toMatch(/Comunicação operacional/)
    expect(missingNames).toMatch(/Fluxo\/Etapas/)
  })
})

// ---------------------------------------------------------------------------
// 4. Optional sections stay warn-only
// ---------------------------------------------------------------------------

describe('optional checklist sections', () => {
  it('absence of optional sections never blocks (warnings only)', () => {
    const filled = fillTemplate(FILLED_SECTIONS)
    const result = validateAnatomy(filled)
    const optionalIssues = result.issues.filter((i) =>
      OPTIONAL_PROMPT_SECTIONS.some((o) => i.message.includes(o.name)),
    )
    for (const issue of optionalIssues) {
      expect(issue.severity).toBe('warning')
    }
  })
})
