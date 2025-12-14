/**
 * useOrganization Hooks
 *
 * React hooks for organization management and switching
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/igniter.client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

/**
 * Hook to fetch all organizations (for GOD/admin users)
 */
export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const result = await api.organizations.list.query({ query: {} });
      return result;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to switch current organization context
 */
export function useSwitchOrganization() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      const result = await api.auth.switchOrganization.mutate({ body: { organizationId } });
      return result;
    },
    onSuccess: (data: any) => {
      // ✅ CORREÇÃO BRUTAL: Extrair data corretamente
      const responseData = data?.data || data;

      // Update access token in localStorage AND cookie
      if (responseData.accessToken) {
        // ✅ Usar 'accessToken' (não 'auth_token')
        localStorage.setItem('accessToken', responseData.accessToken);
        document.cookie = `accessToken=${responseData.accessToken}; path=/; max-age=900; SameSite=Lax`;
      }

      // Invalidate all queries to refetch with new organization context
      queryClient.invalidateQueries();

      toast.success('Organização alterada com sucesso!');

      // Refresh page to update all contexts
      window.location.reload();
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error.message || 'Erro ao trocar organização';
      toast.error(message);
    },
  });
}

/**
 * Hook to fetch current organization details
 */
export function useCurrentOrganization() {
  return useQuery({
    queryKey: ['organization', 'current'],
    queryFn: async () => {
      const result = await api.organizations.getCurrent.query();
      return result;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to update organization settings
 */
export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, data }: { organizationId: string; data: any }) => {
      const result = await api.organizations.update.mutate({ organizationId, ...data });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      toast.success('Organização atualizada com sucesso!');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error.message || 'Erro ao atualizar organização';
      toast.error(message);
    },
  });
}
