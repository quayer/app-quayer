'use client'

import { useState } from 'react'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Separator } from '@/client/components/ui/separator'
import { Switch } from '@/client/components/ui/switch'
import { useAuth } from '@/lib/auth/auth-provider'
import { toast } from 'sonner'
import { Loader2, Save, User, Bell, Palette, Clock } from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import { api } from '@/igniter.client'

export default function SettingsPage() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const [isSaving, setIsSaving] = useState(false)

  // Profile settings
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  })

  // Business hours settings
  const [businessHours, setBusinessHours] = useState({
    enabled: true,
    startTime: '09:00',
    endTime: '18:00',
    timezone: 'America/Sao_Paulo',
    workDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  })

  // Notification settings
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    instanceAlerts: true,
    webhookFailures: true,
    weeklyReport: false,
  })

  const handleSaveProfile = async () => {
    setIsSaving(true)
    try {
      await (api.auth.updateProfile.mutate as any)({
        body: {
          name: profileData.name,
          email: profileData.email,
        },
      })
      toast.success('Perfil atualizado com sucesso!')
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar perfil')
    } finally {
      setIsSaving(false)
    }
  }

  // Business hours and notification preferences do not have backend endpoints yet.
  // Save buttons are disabled with title="Em breve" until APIs are implemented.

  return (
    <div className="flex flex-col gap-6 pt-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie suas preferências e configurações da conta
        </p>
      </div>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <CardTitle>Perfil</CardTitle>
          </div>
          <CardDescription>
            Atualize suas informações pessoais
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={profileData.name}
              onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
              placeholder="Seu nome"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={profileData.email}
              onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
              placeholder="seu@email.com"
            />
          </div>

          <div className="grid gap-2">
            <Label>Função</Label>
            <Input
              value={user?.role || 'N/A'}
              disabled
              className="bg-muted"
            />
          </div>

          <Button onClick={handleSaveProfile} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Salvar Perfil
          </Button>
        </CardContent>
      </Card>

      {/* Appearance Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            <CardTitle>Aparência</CardTitle>
          </div>
          <CardDescription>
            Personalize a aparência da aplicação
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Tema</Label>
              <p className="text-sm text-muted-foreground">
                Escolha o tema da interface
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('light')}
              >
                Claro
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('dark')}
              >
                Escuro
              </Button>
              <Button
                variant={theme === 'system' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('system')}
              >
                Sistema
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Hours Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            <CardTitle>Horário de Atendimento</CardTitle>
          </div>
          <CardDescription>
            Defina o horário de funcionamento para atendimento automático
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Habilitar Horário de Atendimento</Label>
              <p className="text-sm text-muted-foreground">
                Controle automático baseado em horário de trabalho
              </p>
            </div>
            <Switch
              checked={businessHours.enabled}
              onCheckedChange={(checked) =>
                setBusinessHours({ ...businessHours, enabled: checked })
              }
            />
          </div>

          {businessHours.enabled && (
            <>
              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="start-time">Horário de Início</Label>
                  <Input
                    id="start-time"
                    type="time"
                    value={businessHours.startTime}
                    onChange={(e) => setBusinessHours({ ...businessHours, startTime: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="end-time">Horário de Término</Label>
                  <Input
                    id="end-time"
                    type="time"
                    value={businessHours.endTime}
                    onChange={(e) => setBusinessHours({ ...businessHours, endTime: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="timezone">Fuso Horário</Label>
                <Select
                  value={businessHours.timezone}
                  onValueChange={(value) => setBusinessHours({ ...businessHours, timezone: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
                    <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
                    <SelectItem value="America/Rio_Branco">Rio Branco (GMT-5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Dias de Funcionamento</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'monday', label: 'Seg' },
                    { value: 'tuesday', label: 'Ter' },
                    { value: 'wednesday', label: 'Qua' },
                    { value: 'thursday', label: 'Qui' },
                    { value: 'friday', label: 'Sex' },
                    { value: 'saturday', label: 'Sáb' },
                    { value: 'sunday', label: 'Dom' },
                  ].map((day) => (
                    <Button
                      key={day.value}
                      variant={businessHours.workDays.includes(day.value) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        const newWorkDays = businessHours.workDays.includes(day.value)
                          ? businessHours.workDays.filter(d => d !== day.value)
                          : [...businessHours.workDays, day.value]
                        setBusinessHours({ ...businessHours, workDays: newWorkDays })
                      }}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}

          <Button variant="secondary" disabled title="Em breve">
            <Save className="mr-2 h-4 w-4" />
            Salvar Horário
          </Button>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Notificações</CardTitle>
          </div>
          <CardDescription>
            Configure como você deseja receber notificações
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Notificações por E-mail</Label>
              <p className="text-sm text-muted-foreground">
                Receba atualizações por e-mail
              </p>
            </div>
            <Switch
              checked={notificationSettings.emailNotifications}
              onCheckedChange={(checked) =>
                setNotificationSettings({ ...notificationSettings, emailNotifications: checked })
              }
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Alertas de Instância</Label>
              <p className="text-sm text-muted-foreground">
                Seja notificado quando instâncias desconectarem
              </p>
            </div>
            <Switch
              checked={notificationSettings.instanceAlerts}
              onCheckedChange={(checked) =>
                setNotificationSettings({ ...notificationSettings, instanceAlerts: checked })
              }
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Falhas de Webhook</Label>
              <p className="text-sm text-muted-foreground">
                Receba alertas quando webhooks falharem
              </p>
            </div>
            <Switch
              checked={notificationSettings.webhookFailures}
              onCheckedChange={(checked) =>
                setNotificationSettings({ ...notificationSettings, webhookFailures: checked })
              }
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Relatório Semanal</Label>
              <p className="text-sm text-muted-foreground">
                Receba um resumo semanal de atividades
              </p>
            </div>
            <Switch
              checked={notificationSettings.weeklyReport}
              onCheckedChange={(checked) =>
                setNotificationSettings({ ...notificationSettings, weeklyReport: checked })
              }
            />
          </div>

          <Button variant="secondary" disabled title="Em breve">
            <Save className="mr-2 h-4 w-4" />
            Salvar Preferências
          </Button>
        </CardContent>
      </Card>

    </div>
  )
}
