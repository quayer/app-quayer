import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { RegisterInput, LoginInput } from "../auth.interfaces";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

export class AuthRepository {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Criar um novo usuário
   */
  async createUser(data: RegisterInput & { role?: string; organizationId?: string }) {
    const hashedPassword = await bcrypt.hash(data.password, 12);

    return this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        password: hashedPassword,
        name: data.name,
        role: data.role || "user",
        currentOrgId: data.organizationId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        currentOrgId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Buscar usuário por email
   */
  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  /**
   * Buscar usuário por ID
   */
  async findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        currentOrgId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Validar senha do usuário
   */
  async validatePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  /**
   * Criar sessão (DEPRECATED — auth usa JWT + RefreshToken diretamente)
   */
  async createSession(userId: string): Promise<string> {
    const sessionId = crypto.randomBytes(32).toString("hex");

    const token = jwt.sign(
      { userId, sessionId },
      getJwtSecret(),
      { expiresIn: "7d" }
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.session.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });

    return token;
  }

  /**
   * Buscar sessão por token
   */
  async findSessionByToken(token: string) {
    return this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  /**
   * Deletar sessão
   */
  async deleteSession(token: string) {
    return this.prisma.session.delete({
      where: { token },
    });
  }

  /**
   * Criar convite
   */
  async createInvitation(email: string, role: string, invitedById: string, organizationId: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return this.prisma.invitation.create({
      data: {
        email: email.toLowerCase(),
        role,
        invitedById,
        organizationId,
        expiresAt,
      },
    });
  }

  /**
   * Buscar convite por token (só retorna se não expirado)
   */
  async findInvitationByToken(token: string) {
    return this.prisma.invitation.findFirst({
      where: {
        token,
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
      include: { invitedBy: true },
    });
  }

  /**
   * Marcar convite como usado
   */
  async markInvitationAsUsed(token: string) {
    return this.prisma.invitation.update({
      where: { token },
      data: { usedAt: new Date() },
    });
  }

  /**
   * Listar usuários de uma organização
   */
  async listUsers(organizationId?: string) {
    return this.prisma.user.findMany({
      where: organizationId
        ? {
            organizations: {
              some: { organizationId, isActive: true },
            },
          }
        : undefined,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        currentOrgId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Atualizar senha do usuário
   */
  async updatePassword(userId: string, newPassword: string) {
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    return this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  /**
   * Limpar sessões expiradas
   */
  async cleanExpiredSessions() {
    return this.prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }
}
