/**
 * plan-critic — F5+ (Motor de Estratégia, passo 6).
 *
 * A CRÍTICA AUTOMÁTICA: uma segunda passada PURA e auditável que valida o plano
 * (sinais + campos sugeridos + exclusões + contexto) e REPROVA o que não deve
 * passar — a rede de segurança que o usuário pediu ("outro passo valida se o plano
 * está bom"). Reprova, por exemplo:
 *   - perguntar região quando o empreendimento já é específico/tem endereço;
 *   - pedir telefone no WhatsApp;
 *   - prometer aprovação (MCMV/financiamento);
 *   - campo sem justificativa comercial;
 *   - incluir um campo que a própria estratégia excluiu;
 * e ALERTA (warn) sobre:
 *   - falar de agenda sem calendário conectado;
 *   - estratégia que exige humano sem handoff configurado.
 *
 * Pura: zero IO, zero `any`. NÃO muta os inputs. O motor anexa estes achados ao
 * `StrategyPlan`; `reject` indica que o plano precisa de ajuste (no fluxo curado
 * atual deve vir vazio — o crítico é a salvaguarda contra regressões/extensões).
 */

import {
  foldText,
} from '../playbook/niche-inference.pure'
import type {
  BusinessSignals,
  CriticFinding,
  ExcludedField,
  QualificationFieldPlan,
  StrategyContext,
  StrategyDiagnosis,
} from './strategy.types'

/** Estratégias cujo desfecho natural exige um humano (corretor/atendente/profissional). */
const HUMAN_STRATEGIES = new Set([
  'financiamento_popular',
  'empreendimento_especifico',
  'agendamento_assistido',
])

export interface CritiquePlanInput {
  signals: BusinessSignals
  diagnosis: StrategyDiagnosis
  fieldPlan: readonly QualificationFieldPlan[]
  excludedFields: readonly ExcludedField[]
  context: StrategyContext
}

/**
 * Critica o plano e retorna os achados. Sempre inclui um `ok` final quando nenhum
 * `reject` foi gerado (sinaliza "plano passou na crítica"). Pura.
 */
export function critiquePlan(input: CritiquePlanInput): CriticFinding[] {
  const { signals, diagnosis, fieldPlan, excludedFields, context } = input
  const findings: CriticFinding[] = []
  const excludedKeys = new Set(excludedFields.map((e) => e.key))

  for (const field of fieldPlan) {
    const key = field.key.toLowerCase()
    const haystack = foldText([field.key, field.label, field.reason])

    // Telefone no WhatsApp.
    if (context.channelIsWhatsapp && /(telefone|celular|whatsapp|contato_numero)/.test(key)) {
      findings.push({
        kind: 'reject',
        target: `campo:${field.key}`,
        reason: 'Pedir telefone no WhatsApp é redundante — o número já está disponível.',
      })
    }

    // Região quando o produto é específico / já tem endereço.
    if (/regiao/.test(key) && (signals.hasSpecificProduct || signals.hasAddress)) {
      findings.push({
        kind: 'reject',
        target: `campo:${field.key}`,
        reason:
          'O empreendimento já é específico/tem endereço — perguntar região não agrega.',
      })
    }

    // Promessa de aprovação (MCMV/financiamento).
    if (/aprov/.test(haystack)) {
      findings.push({
        kind: 'reject',
        target: `campo:${field.key}`,
        reason: 'A IA não pode prometer aprovação de financiamento/subsídio.',
      })
    }

    // Campo sem justificativa comercial.
    if (field.reason.trim().length === 0) {
      findings.push({
        kind: 'reject',
        target: `campo:${field.key}`,
        reason: 'Todo campo precisa de uma justificativa comercial.',
      })
    }

    // Campo que a própria estratégia EXCLUIU não pode reaparecer no plano.
    if (excludedKeys.has(field.key)) {
      findings.push({
        kind: 'reject',
        target: `campo:${field.key}`,
        reason: 'Este campo foi excluído pela estratégia, mas apareceu no plano.',
      })
    }
  }

  // Agenda sem calendário conectado.
  const planMentionsSchedule = fieldPlan.some((f) =>
    /(horario|agenda|visita|reserva)/.test(foldText([f.key, f.label])),
  )
  if ((signals.hasSchedulingSignal || planMentionsSchedule) && !context.calendarConnected) {
    findings.push({
      kind: 'warn',
      target: 'agenda',
      reason:
        'Há sinais de agendamento, mas não há calendário conectado — não prometer agenda real; registrar intenção e encaminhar.',
    })
  }

  // Estratégia que exige humano sem handoff configurado.
  if (
    (HUMAN_STRATEGIES.has(diagnosis.selectedStrategy) || signals.regulated) &&
    !context.handoffConfigured
  ) {
    findings.push({
      kind: 'warn',
      target: 'handoff_humano',
      reason:
        'Esta estratégia tende a terminar com um humano (corretor/atendente) — recomendo configurar a transferência para humano.',
    })
  }

  const hasReject = findings.some((f) => f.kind === 'reject')
  if (!hasReject) {
    findings.push({
      kind: 'ok',
      target: 'plano',
      reason: 'O plano passou na crítica automática.',
    })
  }

  return findings
}
