'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Save, Building2, Clock, Info } from 'lucide-react';
import { useCurrentOrganization, useUpdateOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Zod schema for organization update
const organizationSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100),
  businessHoursStart: z.string().optional(),
  businessHoursEnd: z.string().optional(),
  businessDays: z.string().optional(),
  timezone: z.string().default('America/Sao_Paulo'),
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

export default function OrganizationSettingsPage() {
  const { data: organization, isLoading } = useCurrentOrganization();
  const updateOrganization = useUpdateOrganization();
  const permissions = usePermissions();
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  const canEdit = permissions.isAdmin || permissions.isMaster;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    values: organization
      ? {
          name: organization.name || '',
          businessHoursStart: organization.businessHoursStart || '09:00',
          businessHoursEnd: organization.businessHoursEnd || '18:00',
          businessDays: organization.businessDays || '1,2,3,4,5',
          timezone: organization.timezone || 'America/Sao_Paulo',
        }
      : undefined,
  });

  // Initialize selected days from organization data
  useState(() => {
    if (organization?.businessDays) {
      setSelectedDays(organization.businessDays.split(','));
    }
  });

  const toggleDay = (day: string) => {
    const newDays = selectedDays.includes(day)
      ? selectedDays.filter(d => d !== day)
      : [...selectedDays, day].sort();

    setSelectedDays(newDays);
    setValue('businessDays', newDays.join(','));
  };

  const onSubmit = (data: OrganizationFormData) => {
    if (!organization?.id) return;

    updateOrganization.mutate({
      organizationId: organization.id,
      data: {
        ...data,
        businessDays: selectedDays.join(','),
      },
    });
  };

  const weekDays = [
    { value: '1', label: 'Seg' },
    { value: '2', label: 'Ter' },
    { value: '3', label: 'Qua' },
    { value: '4', label: 'Qui' },
    { value: '5', label: 'Sex' },
    { value: '6', label: 'Sáb' },
    { value: '0', label: 'Dom' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Building2 className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg text-muted-foreground">Organização não encontrada</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configurações da Organização</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie as informações e configurações da sua organização
          </p>
        </div>
        <Badge variant={canEdit ? "default" : "secondary"}>
          {permissions.isAdmin ? 'GOD' : permissions.isMaster ? 'Master' : permissions.isManager ? 'Manager' : 'User'}
        </Badge>
      </div>

      {!canEdit && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Você está visualizando em modo somente leitura. Apenas administradores GOD e masters podem editar essas configurações.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Organization Information */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              <CardTitle>Informações da Organização</CardTitle>
            </div>
            <CardDescription>
              Dados básicos da organização
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome da Organização</Label>
              <Input
                id="name"
                {...register('name')}
                disabled={!canEdit}
                placeholder="Nome da organização"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="document">Documento (CPF/CNPJ)</Label>
              <Input
                id="document"
                value={organization.document}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                O documento não pode ser alterado
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">Identificador (Slug)</Label>
              <Input
                id="slug"
                value={organization.slug}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                O identificador único não pode ser alterado
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="type">Tipo</Label>
              <Input
                id="type"
                value={organization.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                disabled
                className="bg-muted"
              />
            </div>
          </CardContent>
        </Card>

        {/* Business Hours */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <CardTitle>Horário de Atendimento</CardTitle>
            </div>
            <CardDescription>
              Configure o horário de funcionamento da organização
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="businessHoursStart">Horário de Início</Label>
                <Input
                  id="businessHoursStart"
                  type="time"
                  {...register('businessHoursStart')}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="businessHoursEnd">Horário de Término</Label>
                <Input
                  id="businessHoursEnd"
                  type="time"
                  {...register('businessHoursEnd')}
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Dias de Funcionamento</Label>
              <div className="flex flex-wrap gap-2">
                {weekDays.map((day) => (
                  <Button
                    key={day.value}
                    type="button"
                    variant={selectedDays.includes(day.value) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleDay(day.value)}
                    disabled={!canEdit}
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="timezone">Fuso Horário</Label>
              <Select
                value={watch('timezone')}
                onValueChange={(value) => setValue('timezone', value)}
                disabled={!canEdit}
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
          </CardContent>
        </Card>

        {/* Plan & Limits */}
        <Card>
          <CardHeader>
            <CardTitle>Plano e Limites</CardTitle>
            <CardDescription>
              Informações sobre o plano atual e limites de uso
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Plano Atual</Label>
                <div className="flex items-center gap-2">
                  <Badge variant={organization.billingType === 'free' ? 'secondary' : 'default'}>
                    {organization.billingType?.toUpperCase()}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Máximo de Instâncias</Label>
                <Input
                  value={organization.maxInstances}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="grid gap-2">
                <Label>Máximo de Usuários</Label>
                <Input
                  value={organization.maxUsers}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Para alterar seu plano e aumentar os limites, entre em contato com o suporte.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Save Button */}
        {canEdit && (
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={updateOrganization.isPending}
              size="lg"
            >
              {updateOrganization.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Alterações
                </>
              )}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
