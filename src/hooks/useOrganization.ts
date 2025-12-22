/**
 * useOrganization Hooks
 *
 * React hooks for organization management and switching
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/igniter.client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { extractErrorMessage } from '@/lib/utils/error-handler';
import { useAuth } from '@/lib/auth/auth-provider';
import type { Organization } from '@/types/api.types';

// Helper para fazer requests autenticados com cookies
async function fetchWithAuth<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
    throw new Error(extractErrorMessage(error, `HTTP ${response.status}`));
  }

  return response.json();
}

/**
 * Hook to fetch all organizations (for GOD/admin users)
 */
export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      // ✅ CORREÇÃO: Usar fetch com credentials: include para enviar cookies
      const result = await fetchWithAuth('/api/v1/organizations/');
      return result;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

interface SwitchOrganizationResponse {
  data?: {
    accessToken?: string;
  };
  accessToken?: string;
}

/**
 * Hook to switch current organization context
 */
export function useSwitchOrganization() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      const result = await api.auth.switchOrganization.mutate({ body: { organizationId } });
      return result as SwitchOrganizationResponse;
    },
    onSuccess: async (data: SwitchOrganizationResponse) => {
      const responseData = data?.data || data;

      // Update access token in localStorage AND cookie
      if (responseData.accessToken) {
        localStorage.setItem('accessToken', responseData.accessToken);
        // Cookie with Secure flag for HTTPS (production)
        const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
        const secureFlag = isSecure ? '; Secure' : '';
        document.cookie = `accessToken=${responseData.accessToken}; path=/; max-age=900; SameSite=Lax${secureFlag}`;
      }

      // ✅ CRITICAL: Refresh AuthContext user to update currentOrgId
      await refreshUser();

      // Invalidate all queries to refetch with new organization context
      queryClient.invalidateQueries();

      toast.success('Organização alterada com sucesso!');

      // Use Next.js router.refresh() instead of window.location.reload()
      // This preserves client state while refreshing server components
      router.refresh();
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, 'Erro ao trocar organização'));
    },
  });
}

/**
 * Hook to clear organization context (admin returning to global mode)
 */
export function useClearOrganizationContext() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const result = await api.auth.switchOrganization.mutate({ body: { organizationId: null } });
      return result as SwitchOrganizationResponse;
    },
    onSuccess: async (data: SwitchOrganizationResponse) => {
      const responseData = data?.data || data;

      // Update access token in localStorage AND cookie
      if (responseData.accessToken) {
        localStorage.setItem('accessToken', responseData.accessToken);
        const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
        const secureFlag = isSecure ? '; Secure' : '';
        document.cookie = `accessToken=${responseData.accessToken}; path=/; max-age=900; SameSite=Lax${secureFlag}`;
      }

      // ✅ CRITICAL: Refresh AuthContext user to update currentOrgId to null
      await refreshUser();

      // Invalidate all queries to refetch without organization context
      queryClient.invalidateQueries();

      toast.success('Voltou ao modo Admin Global');

      // Redirect to admin dashboard
      router.push('/admin');
      router.refresh();
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, 'Erro ao sair do contexto'));
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
      // ✅ CORREÇÃO: Usar fetch com credentials: include para enviar cookies
      const result = await fetchWithAuth('/api/v1/organizations/current');
      return result;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

interface UpdateOrganizationParams {
  organizationId: string;
  data: Partial<Organization>;
}

/**
 * Hook to get current organization context (simple version)
 * Returns { currentOrgId, organization, isLoading }
 */
export function useOrganization() {
  const { data, isLoading } = useCurrentOrganization();

  // Extract organization data from response
  const responseData = data as { data?: { id?: string }; id?: string } | undefined;
  const organization = responseData?.data || responseData;
  const currentOrgId = organization?.id || null;

  return {
    currentOrgId,
    organization,
    isLoading,
  };
}

/**
 * Hook to update organization settings
 */
export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, data }: UpdateOrganizationParams) => {
      // Use fetch with proper params structure (API expects PUT /:id with body)
      const response = await fetch(`/api/v1/organizations/${organizationId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
        throw new Error(extractErrorMessage(error, 'Erro ao atualizar organização'));
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      toast.success('Organização atualizada com sucesso!');
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, 'Erro ao atualizar organização'));
    },
  });
}
