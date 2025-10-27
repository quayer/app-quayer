'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/lib/auth/auth-provider'
import { toast } from 'sonner'
import { Loader2, Save, User, Bell, Shield, Palette, Clock } from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

  // ✅ REMOVIDO: Security settings de senha (não faz sentido com OTP login)
  // Login é feito via token OTP, não há senha para alterar

  const handleSaveProfile = async () => {
    setIsSaving(true)
    try {
      // TODO: Implement API call to update profile
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast.success('Perfil atualizado com sucesso!')
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar perfil')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveBusinessHours = async () => {
    setIsSaving(true)
    try {
      // TODO: Implement API call to update business hours
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast.success('Horário de atendimento atualizado!')
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar horário')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveNotifications = async () => {
    setIsSaving(true)
    try {
      // TODO: Implement API call to update notification settings
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast.success('Preferências de notificação atualizadas!')
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar preferências')
    } finally {
      setIsSaving(false)
    }
  }

  // ✅ REMOVIDO: handleChangePassword (não necessário com OTP login)

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

          <Button onClick={handleSaveBusinessHours} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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

          <Button onClick={handleSaveNotifications} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Salvar Preferências
          </Button>
        </CardContent>
      </Card>

      {/* ✅ REMOVIDO: Security Settings (senha)
          - Login é feito via token OTP (sem senha)
          - Não faz sentido ter formulário de "alterar senha"
          - Segurança é gerenciada via tokens temporários no email
      */}
    </div>
  )
}
