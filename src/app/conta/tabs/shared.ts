'use client'

/**
 * Shared types + helpers for the /conta tabs. Structural extraction from
 * conta-client.tsx (no behavior change).
 */

import { Monitor, Smartphone as SmartphoneIcon } from 'lucide-react'
import { getCsrfHeaders } from '@/client/hooks/use-csrf-token'

// ============================================================================
// Types
// ============================================================================

export interface TotpDevice {
  id: string
  name: string
  verified: boolean
  createdAt: string
}

export interface TotpSetupResponse {
  qrCode: string
  secret: string
  deviceId: string
  recoveryCodes: string[]
}

export interface CurrentUser {
  id: string
  name: string | null
  email: string
  avatarUrl?: string | null
  language?: string | null
  timezone?: string | null
}

export interface DeviceSession {
  id: string
  userId: string
  deviceName: string | null
  userAgent: string | null
  ipAddress: string | null
  location: string | null
  lastActiveAt: string
  isRevoked: boolean
  revokedAt: string | null
  createdAt: string
}

export type LinkedProvider = 'google' | 'whatsapp'

export interface LinkedAccount {
  provider: LinkedProvider
  identifier: string
  connectedAt: string | null
}

// ============================================================================
// Helpers
// ============================================================================

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getCsrfHeaders(), ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
    throw new Error(body.message || body.error || `Erro ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function unwrapData<T>(value: unknown): T | null {
  if (value && typeof value === 'object' && 'data' in value) {
    return unwrapData<T>((value as { data: unknown }).data) ?? ((value as { data: T }).data as T)
  }
  return (value as T) ?? null
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Agora mesmo'
  if (diffMin < 60) return `${diffMin} min atrás`
  if (diffHours < 24) return `${diffHours}h atrás`
  if (diffDays < 7) return `${diffDays}d atrás`

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getDeviceIcon(userAgent: string | null) {
  if (!userAgent) return Monitor
  const ua = userAgent.toLowerCase()
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return SmartphoneIcon
  return Monitor
}

export function isCurrentDevice(deviceUserAgent: string | null): boolean {
  if (!deviceUserAgent || typeof navigator === 'undefined') return false
  return navigator.userAgent === deviceUserAgent
}

export function getInitials(name: string | null | undefined, email: string): string {
  const src = (name ?? email).trim()
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

export function providerLabel(p: LinkedProvider): string {
  switch (p) {
    case 'google':
      return 'Google'
    case 'whatsapp':
      return 'WhatsApp'
  }
}
