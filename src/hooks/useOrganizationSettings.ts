/**
 * useOrganizationSettings Hook
 *
 * Shared hook for organization settings components.
 * Consolidates the repeated query/mutation pattern used across:
 * - GeneralSettings
 * - BrandingSettings
 * - ProviderSettings
 * - InfrastructureSettings
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Organization, OrganizationUpdateInput, ApiResponse } from '@/types/api.types';
import { extractErrorMessage } from '@/lib/utils/error-handler';

/**
 * Fetch organization with credentials
 */
async function fetchCurrentOrganization(): Promise<Organization> {
  const response = await fetch('/api/v1/organizations/current', {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
    throw new Error(extractErrorMessage(error, 'Erro ao carregar organização'));
  }

  const result = await response.json();
  // Handle both { data: Organization } and direct Organization response
  return result.data || result;
}

/**
 * Update organization with credentials
 */
async function updateOrganization(
  organizationId: string,
  data: OrganizationUpdateInput
): Promise<Organization> {
  const response = await fetch(`/api/v1/organizations/${organizationId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
    throw new Error(extractErrorMessage(error, 'Erro ao atualizar organização'));
  }

  const result = await response.json();
  return result.data?.organization || result.organization || result.data || result;
}

interface UseOrganizationSettingsOptions {
  /**
   * Success message to show after update
   */
  successMessage?: string;

  /**
   * Callback after successful update
   */
  onSuccess?: (data: Organization) => void;

  /**
   * Callback after failed update
   */
  onError?: (error: Error) => void;
}

/**
 * Hook for organization settings management
 *
 * @example
 * ```tsx
 * const { organization, isLoading, updateSettings, isUpdating } = useOrganizationSettings({
 *   successMessage: 'Configurações gerais atualizadas!',
 * });
 *
 * const handleSave = () => {
 *   updateSettings({ name: newName, slug: newSlug });
 * };
 * ```
 */
export function useOrganizationSettings(options: UseOrganizationSettingsOptions = {}) {
  const queryClient = useQueryClient();
  const { successMessage = 'Organização atualizada com sucesso!', onSuccess, onError } = options;

  // Query for current organization
  const {
    data: organization,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<Organization, Error>({
    queryKey: ['organization', 'current'],
    queryFn: fetchCurrentOrganization,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  // Mutation for updating organization
  const updateMutation = useMutation<Organization, Error, OrganizationUpdateInput>({
    mutationFn: async (data) => {
      if (!organization?.id) {
        throw new Error('Organização não encontrada');
      }
      return updateOrganization(organization.id, data);
    },
    onSuccess: (data) => {
      toast.success(successMessage);

      // Invalidate all organization queries
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });

      onSuccess?.(data);
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Erro ao atualizar organização'));
      onError?.(error);
    },
  });

  return {
    // Query state
    organization,
    isLoading,
    queryError,
    refetch,

    // Mutation
    updateSettings: updateMutation.mutate,
    updateSettingsAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,

    // Helpers
    organizationId: organization?.id,
  };
}

/**
 * Hook for organization branding settings
 * Extends base hook with branding-specific defaults
 */
export function useOrganizationBranding(options: UseOrganizationSettingsOptions = {}) {
  return useOrganizationSettings({
    successMessage: 'Identidade visual atualizada!',
    ...options,
  });
}

/**
 * Hook for organization provider settings
 * Extends base hook with provider-specific defaults
 */
export function useOrganizationProvider(options: UseOrganizationSettingsOptions = {}) {
  return useOrganizationSettings({
    successMessage: 'Configurações do provedor atualizadas!',
    ...options,
  });
}

/**
 * Hook for organization infrastructure settings
 * Extends base hook with infrastructure-specific defaults
 */
export function useOrganizationInfrastructure(options: UseOrganizationSettingsOptions = {}) {
  return useOrganizationSettings({
    successMessage: 'Configurações de infraestrutura atualizadas!',
    ...options,
  });
}

export default useOrganizationSettings;
