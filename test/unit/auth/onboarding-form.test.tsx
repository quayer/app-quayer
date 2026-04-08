import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

// Mock igniter.client
vi.mock('@/igniter.client', () => ({
  api: {},
  getAuthHeaders: vi.fn(() => ({})),
}))

// Mock the server action
const mockCreateOrganizationAction = vi.fn()
vi.mock('@/app/(auth)/onboarding/actions', () => ({
  createOrganizationAction: (...args: unknown[]) => mockCreateOrganizationAction(...args),
}))

// Mock CSRF headers
vi.mock('@/client/hooks/use-csrf-token', () => ({
  getCsrfHeaders: vi.fn(() => ({ 'x-csrf-token': 'mock-csrf-token' })),
}))

import { OnboardingForm } from '@/client/components/auth/onboarding-form'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

/** Setup default MSW handlers for onboarding endpoints */
function setupDefaultHandlers(userName = '') {
  server.use(
    http.get('/api/v1/auth/me', () => {
      return HttpResponse.json({ data: { name: userName } })
    }),
    http.patch('/api/v1/auth/profile', () => {
      return HttpResponse.json({ data: { success: true } })
    })
  )
}

describe('OnboardingForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateOrganizationAction.mockReset()
    // Default: new user without name
    setupDefaultHandlers('')
  })

  it('should show loading state initially then render the name step', async () => {
    render(<OnboardingForm />, { wrapper: createWrapper() })

    // Initially shows loading spinner
    expect(screen.getByText('Carregando...')).toBeInTheDocument()

    // After fetch resolves, shows the name step
    await waitFor(() => {
      expect(screen.getByText('Configure sua conta')).toBeInTheDocument()
    })
  })

  it('should render firstName, lastName, and companyName fields', async () => {
    render(<OnboardingForm />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Configure sua conta')).toBeInTheDocument()
    })

    expect(screen.getByLabelText(/nome/i, { selector: '#firstName' })).toBeInTheDocument()
    expect(screen.getByLabelText(/sobrenome/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/nome da empresa/i)).toBeInTheDocument()
  })

  it('should pre-fill name fields when user has existing name from Google login', async () => {
    setupDefaultHandlers('Gabriel Silva')

    render(<OnboardingForm />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Configure sua conta')).toBeInTheDocument()
    })

    const firstNameInput = screen.getByLabelText(/nome/i, { selector: '#firstName' }) as HTMLInputElement
    const lastNameInput = screen.getByLabelText(/sobrenome/i) as HTMLInputElement

    expect(firstNameInput.value).toBe('Gabriel')
    expect(lastNameInput.value).toBe('Silva')
  })

  it('should keep submit button disabled when firstName is empty', async () => {
    const user = userEvent.setup()
    render(<OnboardingForm />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Configure sua conta')).toBeInTheDocument()
    })

    const companyInput = screen.getByLabelText(/nome da empresa/i)
    const submitButton = screen.getByRole('button', { name: /continuar/i })

    // Only fill company name, leave firstName empty
    await user.type(companyInput, 'Minha Empresa')

    // Button should remain disabled because firstName is empty
    expect(submitButton).toBeDisabled()
  })

  it('should keep submit button disabled when companyName is empty', async () => {
    const user = userEvent.setup()
    render(<OnboardingForm />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Configure sua conta')).toBeInTheDocument()
    })

    const firstNameInput = screen.getByLabelText(/nome/i, { selector: '#firstName' })
    const submitButton = screen.getByRole('button', { name: /continuar/i })

    // Only fill firstName, leave company empty
    await user.type(firstNameInput, 'Gabriel')

    // Button should remain disabled because companyName is empty
    expect(submitButton).toBeDisabled()
  })

  it('should disable submit button when required fields are empty', async () => {
    render(<OnboardingForm />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Configure sua conta')).toBeInTheDocument()
    })

    const submitButton = screen.getByRole('button', { name: /continuar/i })
    expect(submitButton).toBeDisabled()
  })

  it('should submit form and call createOrganizationAction on success', async () => {
    mockCreateOrganizationAction.mockResolvedValueOnce({ success: true })

    const user = userEvent.setup()
    render(<OnboardingForm />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Configure sua conta')).toBeInTheDocument()
    })

    const firstNameInput = screen.getByLabelText(/nome/i, { selector: '#firstName' })
    const lastNameInput = screen.getByLabelText(/sobrenome/i)
    const companyInput = screen.getByLabelText(/nome da empresa/i)
    const submitButton = screen.getByRole('button', { name: /continuar/i })

    await user.type(firstNameInput, 'Gabriel')
    await user.type(lastNameInput, 'Silva')
    await user.type(companyInput, 'Quayer')
    await user.click(submitButton)

    // Should call createOrganizationAction with company name
    await waitFor(() => {
      expect(mockCreateOrganizationAction).toHaveBeenCalled()
      const formData = mockCreateOrganizationAction.mock.calls[0][0] as FormData
      expect(formData.get('name')).toBe('Quayer')
      expect(formData.get('type')).toBe('pj')
    })
  })

  it('should have accessible form labels and aria attributes', async () => {
    render(<OnboardingForm />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Configure sua conta')).toBeInTheDocument()
    })

    // All required fields have aria-required
    const firstNameInput = screen.getByLabelText(/nome/i, { selector: '#firstName' })
    expect(firstNameInput).toHaveAttribute('aria-required', 'true')

    const lastNameInput = screen.getByLabelText(/sobrenome/i)
    expect(lastNameInput).toHaveAttribute('aria-required', 'true')

    const companyInput = screen.getByLabelText(/nome da empresa/i)
    expect(companyInput).toHaveAttribute('aria-required', 'true')

    // Submit button has aria-busy
    const submitButton = screen.getByRole('button', { name: /continuar/i })
    expect(submitButton).toHaveAttribute('aria-busy', 'false')
  })
})
