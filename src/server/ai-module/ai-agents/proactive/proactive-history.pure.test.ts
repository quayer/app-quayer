/**
 * proactive-history.pure.test — cobre o mapper de histórico legível (F1.5).
 * Pina os rótulos PT de status + desfecho e a conversão da linha do DB.
 */

import { describe, it, expect } from 'vitest'
import {
  describeProactiveStatus,
  describeProactiveOutcome,
  toProactiveHistoryItem,
  type ProactiveMessageRow,
} from './proactive-history.pure'

describe('describeProactiveStatus', () => {
  it.each([
    ['pending', 'Agendado'],
    ['sent', 'Enviado'],
    ['cancelled', 'Cancelado'],
    ['failed', 'Falhou'],
  ])('%s → %s', (status, label) => {
    expect(describeProactiveStatus(status)).toBe(label)
  })

  it('status desconhecido → fallback para o próprio código', () => {
    expect(describeProactiveStatus('weird')).toBe('weird')
  })
})

describe('describeProactiveOutcome', () => {
  it('sent → "Mensagem enviada" sem código', () => {
    expect(describeProactiveOutcome('sent', null)).toEqual({
      reason: null,
      label: 'Mensagem enviada',
    })
  })

  it('pending → "Aguardando horário de envio"', () => {
    expect(describeProactiveOutcome('pending', null)).toEqual({
      reason: null,
      label: 'Aguardando horário de envio',
    })
  })

  it.each([
    ['customer_replied', 'Cliente respondeu antes do envio'],
    ['opted_out', 'Cliente pediu para não receber mais mensagens'],
    ['outside_window_no_template', 'Fora da janela de 24h e sem template aprovado'],
    ['anti_spam', 'Limite de mensagens sem resposta atingido'],
  ])('cancelled/%s → rótulo conhecido', (code, label) => {
    expect(describeProactiveOutcome('cancelled', code)).toEqual({
      reason: code,
      label,
    })
  })

  it('failed com reason conhecido → rótulo amigável', () => {
    expect(describeProactiveOutcome('failed', 'no_text_resolved')).toEqual({
      reason: 'no_text_resolved',
      label: 'Não foi possível gerar o texto com segurança',
    })
  })

  it('failed com erro arbitrário do transporte → "Erro: <código>"', () => {
    const out = describeProactiveOutcome('failed', 'graph error 131047')
    expect(out.reason).toBe('graph error 131047')
    expect(out.label).toBe('Erro: graph error 131047')
  })

  it('cancelled sem cancelledReason → fallback "Cancelado"', () => {
    expect(describeProactiveOutcome('cancelled', null)).toEqual({
      reason: null,
      label: 'Cancelado',
    })
  })
})

describe('toProactiveHistoryItem', () => {
  const base: ProactiveMessageRow = {
    id: 'sm-1',
    status: 'sent',
    reason: 'lead parado',
    messageGoal: 'retomar interesse',
    scheduledAt: new Date('2026-06-13T12:00:00.000Z'),
    sentAt: new Date('2026-06-13T12:00:05.000Z'),
    cancelledReason: null,
    contactPhone: '5511999999999',
    createdAt: new Date('2026-06-13T11:00:00.000Z'),
  }

  it('mapeia uma linha enviada com datas em ISO e goal preferindo messageGoal', () => {
    const item = toProactiveHistoryItem(base)
    expect(item).toEqual({
      id: 'sm-1',
      status: 'sent',
      statusLabel: 'Enviado',
      contactPhone: '5511999999999',
      goal: 'retomar interesse',
      scheduledAt: '2026-06-13T12:00:00.000Z',
      sentAt: '2026-06-13T12:00:05.000Z',
      outcomeReason: null,
      outcomeLabel: 'Mensagem enviada',
    })
  })

  it('cancelada por opt-out → outcome legível + sentAt null', () => {
    const item = toProactiveHistoryItem({
      ...base,
      status: 'cancelled',
      sentAt: null,
      cancelledReason: 'opted_out',
    })
    expect(item.statusLabel).toBe('Cancelado')
    expect(item.outcomeReason).toBe('opted_out')
    expect(item.outcomeLabel).toBe('Cliente pediu para não receber mais mensagens')
    expect(item.sentAt).toBeNull()
  })

  it('goal cai para reason quando messageGoal é null', () => {
    const item = toProactiveHistoryItem({ ...base, messageGoal: null })
    expect(item.goal).toBe('lead parado')
  })
})
