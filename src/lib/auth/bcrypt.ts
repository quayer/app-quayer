/**
 * Password Hashing and Verification Utilities
 *
 * Usa bcryptjs com 12 rounds de salt para segurança máxima
 */

import bcrypt from 'bcryptjs';

/**
 * Número de rounds do salt para bcrypt
 * 12 rounds é considerado seguro e equilibra segurança com performance
 */
const SALT_ROUNDS = 12;

/**
 * Hash de senha usando bcrypt com 12 rounds
 *
 * @param password - Senha em texto plano
 * @returns Promise com hash da senha
 *
 * @example
 * ```ts
 * const hashedPassword = await hashPassword('senha123');
 * ```
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length === 0) {
    throw new Error('Password cannot be empty');
  }

  if (password.length > 72) {
    // bcrypt tem limite de 72 caracteres
    throw new Error('Password cannot exceed 72 characters');
  }

  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifica se uma senha corresponde ao hash
 *
 * @param password - Senha em texto plano
 * @param hashedPassword - Hash armazenado no banco
 * @returns Promise<boolean> - true se a senha está correta
 *
 * @example
 * ```ts
 * const isValid = await verifyPassword('senha123', user.password);
 * if (isValid) {
 *   // Login bem-sucedido
 * }
 * ```
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  if (!password || !hashedPassword) {
    return false;
  }

  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
}

/**
 * Gera uma senha aleatória segura
 *
 * @param length - Tamanho da senha (padrão: 16)
 * @returns Senha aleatória
 *
 * @example
 * ```ts
 * const tempPassword = generateRandomPassword();
 * await sendEmail(user.email, `Sua senha temporária: ${tempPassword}`);
 * ```
 */
export function generateRandomPassword(length: number = 16): string {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }

  return password;
}

/**
 * Valida força da senha
 *
 * @param password - Senha para validar
 * @returns Objeto com resultado da validação
 *
 * Critérios:
 * - Mínimo 8 caracteres
 * - Pelo menos 1 letra maiúscula
 * - Pelo menos 1 letra minúscula
 * - Pelo menos 1 número
 * - Pelo menos 1 caractere especial
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
} {
  const errors: string[] = [];
  let score = 0;

  // Mínimo 8 caracteres
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  } else {
    score++;
  }

  // Letra maiúscula
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  } else {
    score++;
  }

  // Letra minúscula
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  } else {
    score++;
  }

  // Número
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  } else {
    score++;
  }

  // Caractere especial
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  } else {
    score++;
  }

  // Determinar força
  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  if (score >= 5) strength = 'strong';
  else if (score >= 3) strength = 'medium';

  return {
    isValid: errors.length === 0,
    errors,
    strength,
  };
}
