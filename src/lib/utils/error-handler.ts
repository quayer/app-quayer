/**
 * Centralized Error Handler Utility
 *
 * Provides consistent error extraction and formatting across the application.
 * Handles various error response formats from Igniter.js, fetch, and other sources.
 */

/**
 * Standard error response shape
 */
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Array<{ field?: string; message: string }>;
}

/**
 * Extract error message from various error formats
 *
 * Handles:
 * - Igniter.js error responses: { error: { message: string } }
 * - Fetch error responses: { message: string } or { error: string }
 * - Zod validation errors: { error: { details: [{ message }] } }
 * - Plain Error objects
 * - String errors
 *
 * @param error - The error object to extract message from
 * @param fallback - Fallback message if extraction fails
 * @returns The extracted error message
 */
export function extractErrorMessage(error: unknown, fallback: string = 'Erro desconhecido'): string {
  if (!error) return fallback;

  // String error
  if (typeof error === 'string') return error;

  // Error object with message
  if (error instanceof Error) return error.message;

  // Object error - check various formats
  if (typeof error === 'object') {
    const err = error as Record<string, unknown>;

    // Direct message property
    if (typeof err.message === 'string' && err.message) {
      return err.message;
    }

    // Direct error string property
    if (typeof err.error === 'string' && err.error) {
      return err.error;
    }

    // Nested error.message (Igniter.js format)
    if (err.error && typeof err.error === 'object') {
      const nestedError = err.error as Record<string, unknown>;

      // error.message can be string or object
      if (typeof nestedError.message === 'string') {
        return nestedError.message;
      }

      // error.message.error (deeply nested)
      if (nestedError.message && typeof nestedError.message === 'object') {
        const deepError = nestedError.message as Record<string, unknown>;
        if (typeof deepError.error === 'string') {
          return deepError.error;
        }
      }

      // Zod validation errors: error.details array
      if (Array.isArray(nestedError.details) && nestedError.details.length > 0) {
        const firstDetail = nestedError.details[0] as Record<string, unknown>;
        if (typeof firstDetail.message === 'string') {
          return firstDetail.message;
        }
      }
    }

    // Response data format (axios/fetch)
    if (err.response && typeof err.response === 'object') {
      const response = err.response as Record<string, unknown>;
      if (response.data && typeof response.data === 'object') {
        const data = response.data as Record<string, unknown>;
        if (typeof data.error === 'string') return data.error;
        if (typeof data.message === 'string') return data.message;
      }
    }

    // Data property
    if (err.data && typeof err.data === 'object') {
      const data = err.data as Record<string, unknown>;
      if (typeof data.message === 'string') return data.message;
      if (typeof data.error === 'string') return data.error;
    }
  }

  return fallback;
}

/**
 * Parse full API error with all details
 *
 * @param error - The error object to parse
 * @returns Structured ApiError object
 */
export function parseApiError(error: unknown): ApiError {
  const message = extractErrorMessage(error);

  if (!error || typeof error !== 'object') {
    return { message };
  }

  const err = error as Record<string, unknown>;

  // Extract status code
  let status: number | undefined;
  if (typeof err.status === 'number') {
    status = err.status;
  } else if (err.response && typeof err.response === 'object') {
    const response = err.response as Record<string, unknown>;
    if (typeof response.status === 'number') {
      status = response.status;
    }
  }

  // Extract error code
  let code: string | undefined;
  if (typeof err.code === 'string') {
    code = err.code;
  } else if (err.error && typeof err.error === 'object') {
    const nestedError = err.error as Record<string, unknown>;
    if (typeof nestedError.code === 'string') {
      code = nestedError.code;
    }
  }

  // Extract validation details
  let details: Array<{ field?: string; message: string }> | undefined;
  if (err.error && typeof err.error === 'object') {
    const nestedError = err.error as Record<string, unknown>;
    if (Array.isArray(nestedError.details)) {
      details = nestedError.details.map((d: unknown) => {
        if (typeof d === 'object' && d) {
          const detail = d as Record<string, unknown>;
          return {
            field: typeof detail.path === 'string' ? detail.path : undefined,
            message: typeof detail.message === 'string' ? detail.message : 'Erro de validação',
          };
        }
        return { message: 'Erro de validação' };
      });
    }
  }

  return { message, code, status, details };
}

/**
 * Get user-friendly error message based on HTTP status code
 *
 * @param status - HTTP status code
 * @param defaultMessage - Default message if status not mapped
 * @returns User-friendly error message
 */
export function getStatusErrorMessage(status: number, defaultMessage?: string): string {
  const statusMessages: Record<number, string> = {
    400: 'Dados inválidos. Verifique os campos e tente novamente.',
    401: 'Sessão expirada. Faça login novamente.',
    403: 'Você não tem permissão para realizar esta ação.',
    404: 'Recurso não encontrado.',
    409: 'Conflito: este recurso já existe.',
    422: 'Dados inválidos. Verifique os campos.',
    429: 'Muitas requisições. Aguarde um momento.',
    500: 'Erro interno do servidor. Tente novamente mais tarde.',
    502: 'Servidor temporariamente indisponível.',
    503: 'Serviço indisponível. Tente novamente mais tarde.',
  };

  return statusMessages[status] || defaultMessage || 'Erro desconhecido. Tente novamente.';
}

/**
 * Check if error is a network/connection error
 *
 * @param error - The error to check
 * @returns True if it's a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  const message = extractErrorMessage(error).toLowerCase();

  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('aborted') ||
    (error instanceof TypeError && message.includes('fetch'))
  );
}

/**
 * Check if error is an authentication error
 *
 * @param error - The error to check
 * @returns True if it's an auth error
 */
export function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as Record<string, unknown>;

  // Check status code
  if (err.status === 401 || err.status === 403) return true;

  if (err.response && typeof err.response === 'object') {
    const response = err.response as Record<string, unknown>;
    if (response.status === 401 || response.status === 403) return true;
  }

  // Check message content
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes('unauthorized') ||
    message.includes('não autorizado') ||
    message.includes('sessão expirada') ||
    message.includes('token') ||
    message.includes('autenticação')
  );
}
