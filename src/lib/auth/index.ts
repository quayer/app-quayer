/**
 * Auth Library - Barrel Export
 *
 * Exporta todas as funções e tipos de autenticação
 */

// Password Hashing
export * from './bcrypt';

// JWT Tokens
export * from './jwt';

// Roles and Hierarchy
export * from './roles';

// Permissions System
export * from './permissions';

// Auth Context & Provider
export { AuthProvider, useAuth } from './auth-provider';

