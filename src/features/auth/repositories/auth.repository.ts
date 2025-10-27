import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { RegisterInput, LoginInput } from "../auth.interfaces";

export class AuthRepository {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Criar um novo usuário
   */
  async createUser(data: RegisterInput & { role?: string; organizationId?: string }) {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: data.role || "user",
        organizationId: data.organizationId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        organizationId: true,
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
      where: { email },
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
        organizationId: true,
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
   * Criar sessão
   */
  async createSession(userId: string): Promise<string> {
    // Gerar ID único para evitar tokens duplicados
    const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);

    const token = jwt.sign(
      { userId, sessionId },
      process.env.JWT_SECRET || "secret",
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
  async createInvitation(email: string, role: string, invitedById: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expira em 7 dias

    return this.prisma.invitation.create({
      data: {
        email,
        role,
        invitedById,
        expiresAt,
      },
    });
  }

  /**
   * Buscar convite por token
   */
  async findInvitationByToken(token: string) {
    return this.prisma.invitation.findUnique({
      where: { token },
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
   * Listar todos os usuários
   */
  async listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        organizationId: true,
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
    const hashedPassword = await bcrypt.hash(newPassword, 10);

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