import { z } from "zod";

/**
 * @constant RegisterSchema
 * @description Schema para registro de novo usuário
 */
export const RegisterSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
});

/**
 * @constant LoginSchema
 * @description Schema para login de usuário
 */
export const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

/**
 * @constant InviteSchema
 * @description Schema para convite de usuário
 */
export const InviteSchema = z.object({
  email: z.string().email("Email inválido"),
  role: z.enum(["admin", "user"]).default("user"),
});

/**
 * @constant ChangePasswordSchema
 * @description Schema para mudança de senha
 */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual é obrigatória"),
  newPassword: z.string().min(8, "Nova senha deve ter no mínimo 8 caracteres"),
});

/**
 * @constant UserResponseSchema
 * @description Schema de resposta do usuário
 */
export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * @constant SessionResponseSchema
 * @description Schema de resposta da sessão
 */
export const SessionResponseSchema = z.object({
  token: z.string(),
  user: UserResponseSchema,
  expiresAt: z.date(),
});

/**
 * Types
 */
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type InviteInput = z.infer<typeof InviteSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
