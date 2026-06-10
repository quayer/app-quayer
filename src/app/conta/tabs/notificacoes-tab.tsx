'use client'

/**
 * Tab: Notificações — preferências de email e push.
 * Structural extraction from conta-client.tsx (no behavior change).
 */

import { useState } from 'react'
import { Loader2, Mail, Smartphone as SmartphoneIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Button } from '@/client/components/ui/button'

import { PrefRow } from './pref-row'

interface NotifPrefs {
  emailSecurity: boolean
  emailProductUpdates: boolean
  emailMarketing: boolean
  pushEnabled: boolean
  pushMentions: boolean
  pushDeployments: boolean
}

export function NotificacoesTab() {
  // TODO(backend): GET/PUT /api/v1/notifications/preferences
  const [prefs, setPrefs] = useState<NotifPrefs>({
    emailSecurity: true,
    emailProductUpdates: true,
    emailMarketing: false,
    pushEnabled: false,
    pushMentions: true,
    pushDeployments: true,
  })
  const [saving, setSaving] = useState(false)

  const toggle = (key: keyof NotifPrefs) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await new Promise((r) => setTimeout(r, 400))
      toast.success('Preferências de notificação salvas')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Email
          </CardTitle>
          <CardDescription>Mensagens enviadas para o seu endereço de email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 divide-y divide-border">
          <PrefRow
            id="notif-email-security"
            label="Alertas de segurança"
            description="Novos logins e mudanças na sua conta."
            checked={prefs.emailSecurity}
            onChange={() => toggle('emailSecurity')}
          />
          <PrefRow
            id="notif-email-updates"
            label="Atualizações do produto"
            description="Novidades, releases e mudanças importantes."
            checked={prefs.emailProductUpdates}
            onChange={() => toggle('emailProductUpdates')}
          />
          <PrefRow
            id="notif-email-marketing"
            label="Marketing e dicas"
            description="Conteúdo educacional e promoções."
            checked={prefs.emailMarketing}
            onChange={() => toggle('emailMarketing')}
          />
        </CardContent>
      </Card>

      {/* Push */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmartphoneIcon className="h-4 w-4 text-muted-foreground" />
            Push / no app
          </CardTitle>
          <CardDescription>Notificações dentro da aplicação e no navegador.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 divide-y divide-border">
          <PrefRow
            id="notif-push-enabled"
            label="Ativar notificações push"
            description="Requer permissão do navegador."
            checked={prefs.pushEnabled}
            onChange={() => toggle('pushEnabled')}
          />
          <PrefRow
            id="notif-push-mentions"
            label="Menções e respostas"
            description="Quando alguém interage com você."
            checked={prefs.pushMentions}
            onChange={() => toggle('pushMentions')}
            disabled={!prefs.pushEnabled}
          />
          <PrefRow
            id="notif-push-deployments"
            label="Deploys e builds"
            description="Status de deploys dos seus projetos Builder."
            checked={prefs.pushDeployments}
            onChange={() => toggle('pushDeployments')}
            disabled={!prefs.pushEnabled}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar preferências
        </Button>
      </div>
    </div>
  )
}
