/**
 * useOnboarding Hook
 *
 * React hook for completing user onboarding
 */

import { useMutation } from '@tanstack/react-query';
import { api } from '@/igniter.client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export interface CompleteOnboardingData {
  organizationName: string;
  organizationType: 'pf' | 'pj';
  document: string;
  businessHoursStart?: string;
  businessHoursEnd?: string;
  businessDays?: string;
  timezone?: string;
}

export function useCompleteOnboarding() {
  const router = useRouter();

  return useMutation({
    mutationFn: async (data: CompleteOnboardingData) => {
      const result = await api.onboarding.complete.mutate(data);
      return result;
    },
    onSuccess: (data: any) => {
      // Update access token in localStorage
      if (data.accessToken) {
        localStorage.setItem('auth_token', data.accessToken);
      }

      toast.success('Organização criada com sucesso!');

      // Redirect to dashboard
      setTimeout(() => {
        router.push('/integracoes');
        router.refresh();
      }, 500);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error.message || 'Erro ao completar onboarding';
      toast.error(message);
    },
  });
}
