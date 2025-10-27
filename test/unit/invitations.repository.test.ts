/**
 * Invitations Repository Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { invitationsRepository } from '@/features/invitations/invitations.repository';
import { database } from '@/services/database';

describe('InvitationsRepository', () => {
  let testUser: any;
  let testOrg: any;

  beforeEach(async () => {
    // Create test user
    testUser = await database.user.create({
      data: {
        email: 'test-inviter@example.com',
        name: 'Test Inviter',
        password: 'hashedpassword123',
        role: 'user',
        onboardingCompleted: true,
      },
    });

    // Create test organization
    testOrg = await database.organization.create({
      data: {
        name: 'Test Organization',
        slug: 'test-org',
        document: '12345678901',
        type: 'pf',
      },
    });

    // Add user to organization
    await database.userOrganization.create({
      data: {
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'master',
        isActive: true,
      },
    });
  });

  afterEach(async () => {
    // Cleanup
    await database.invitation.deleteMany({
      where: { organizationId: testOrg.id },
    });
    await database.userOrganization.deleteMany({
      where: { organizationId: testOrg.id },
    });
    await database.organization.delete({
      where: { id: testOrg.id },
    });
    await database.user.delete({
      where: { id: testUser.id },
    });
  });

  describe('create', () => {
    it('should create invitation with default 7 days expiration', async () => {
      const invitation = await invitationsRepository.create({
        email: 'newuser@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      expect(invitation).toBeDefined();
      expect(invitation.email).toBe('newuser@example.com');
      expect(invitation.role).toBe('user');
      expect(invitation.organizationId).toBe(testOrg.id);
      expect(invitation.invitedById).toBe(testUser.id);
      expect(invitation.token).toBeDefined();
      expect(invitation.usedAt).toBeNull();

      // Check expiration is ~7 days from now
      const now = new Date();
      const expectedExpiry = new Date(now);
      expectedExpiry.setDate(expectedExpiry.getDate() + 7);

      const timeDiff = Math.abs(invitation.expiresAt.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it('should create invitation with custom expiration days', async () => {
      const invitation = await invitationsRepository.create({
        email: 'newuser@example.com',
        role: 'manager',
        organizationId: testOrg.id,
        invitedById: testUser.id,
        expiresInDays: 14,
      });

      const now = new Date();
      const expectedExpiry = new Date(now);
      expectedExpiry.setDate(expectedExpiry.getDate() + 14);

      const timeDiff = Math.abs(invitation.expiresAt.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(1000);
    });

    it('should include invitedBy relation', async () => {
      const invitation = await invitationsRepository.create({
        email: 'newuser@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      expect(invitation.invitedBy).toBeDefined();
      expect(invitation.invitedBy.id).toBe(testUser.id);
      expect(invitation.invitedBy.email).toBe(testUser.email);
      expect(invitation.invitedBy.name).toBe(testUser.name);
    });
  });

  describe('findByToken', () => {
    it('should find invitation by token', async () => {
      const created = await invitationsRepository.create({
        email: 'newuser@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      const found = await invitationsRepository.findByToken(created.token);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.email).toBe(created.email);
    });

    it('should return null for invalid token', async () => {
      const found = await invitationsRepository.findByToken('invalid-token-123');
      expect(found).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find invitation by ID', async () => {
      const created = await invitationsRepository.create({
        email: 'newuser@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      const found = await invitationsRepository.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.token).toBe(created.token);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      // Create multiple invitations for testing
      await invitationsRepository.create({
        email: 'user1@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      await invitationsRepository.create({
        email: 'manager1@example.com',
        role: 'manager',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      await invitationsRepository.create({
        email: 'master1@example.com',
        role: 'master',
        organizationId: testOrg.id,
        invitedById: testUser.id,
        expiresInDays: 1,
      });
    });

    it('should list all invitations for organization', async () => {
      const result = await invitationsRepository.list({
        organizationId: testOrg.id,
      });

      expect(result.data).toHaveLength(3);
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });

    it('should filter by role', async () => {
      const result = await invitationsRepository.list({
        organizationId: testOrg.id,
        role: 'manager',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].role).toBe('manager');
      expect(result.data[0].email).toBe('manager1@example.com');
    });

    it('should filter by email', async () => {
      const result = await invitationsRepository.list({
        organizationId: testOrg.id,
        email: 'user1',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].email).toBe('user1@example.com');
    });

    it('should filter by status pending', async () => {
      const result = await invitationsRepository.list({
        organizationId: testOrg.id,
        status: 'pending',
      });

      // All 3 should be pending (not used and not expired yet)
      expect(result.data.length).toBeGreaterThanOrEqual(3);
    });

    it('should support pagination', async () => {
      const page1 = await invitationsRepository.list({
        organizationId: testOrg.id,
        page: 1,
        limit: 2,
      });

      expect(page1.data).toHaveLength(2);
      expect(page1.pagination.totalPages).toBe(2);

      const page2 = await invitationsRepository.list({
        organizationId: testOrg.id,
        page: 2,
        limit: 2,
      });

      expect(page2.data).toHaveLength(1);
    });
  });

  describe('markAsUsed', () => {
    it('should mark invitation as used', async () => {
      const invitation = await invitationsRepository.create({
        email: 'newuser@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      expect(invitation.usedAt).toBeNull();

      const marked = await invitationsRepository.markAsUsed(invitation.token);

      expect(marked.usedAt).toBeDefined();
      expect(marked.usedAt).toBeInstanceOf(Date);
      expect(marked.id).toBe(invitation.id);
    });
  });

  describe('delete', () => {
    it('should delete invitation', async () => {
      const invitation = await invitationsRepository.create({
        email: 'newuser@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      await invitationsRepository.delete(invitation.id);

      const found = await invitationsRepository.findById(invitation.id);
      expect(found).toBeNull();
    });
  });

  describe('hasPendingInvitation', () => {
    it('should return true for pending invitation', async () => {
      await invitationsRepository.create({
        email: 'newuser@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      const hasPending = await invitationsRepository.hasPendingInvitation(
        'newuser@example.com',
        testOrg.id
      );

      expect(hasPending).toBe(true);
    });

    it('should return false for used invitation', async () => {
      const invitation = await invitationsRepository.create({
        email: 'newuser@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      await invitationsRepository.markAsUsed(invitation.token);

      const hasPending = await invitationsRepository.hasPendingInvitation(
        'newuser@example.com',
        testOrg.id
      );

      expect(hasPending).toBe(false);
    });

    it('should return false for non-existent email', async () => {
      const hasPending = await invitationsRepository.hasPendingInvitation(
        'nonexistent@example.com',
        testOrg.id
      );

      expect(hasPending).toBe(false);
    });
  });

  describe('isValid', () => {
    it('should return true for valid pending invitation', async () => {
      const invitation = await invitationsRepository.create({
        email: 'newuser@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      const isValid = await invitationsRepository.isValid(invitation.token);
      expect(isValid).toBe(true);
    });

    it('should return false for used invitation', async () => {
      const invitation = await invitationsRepository.create({
        email: 'newuser@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      await invitationsRepository.markAsUsed(invitation.token);

      const isValid = await invitationsRepository.isValid(invitation.token);
      expect(isValid).toBe(false);
    });

    it('should return false for invalid token', async () => {
      const isValid = await invitationsRepository.isValid('invalid-token');
      expect(isValid).toBe(false);
    });
  });

  describe('countPending', () => {
    it('should count pending invitations', async () => {
      await invitationsRepository.create({
        email: 'user1@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      await invitationsRepository.create({
        email: 'user2@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
      });

      const count = await invitationsRepository.countPending(testOrg.id);
      expect(count).toBe(2);
    });
  });

  describe('updateExpiration', () => {
    it('should update invitation expiration', async () => {
      const invitation = await invitationsRepository.create({
        email: 'newuser@example.com',
        role: 'user',
        organizationId: testOrg.id,
        invitedById: testUser.id,
        expiresInDays: 7,
      });

      const updated = await invitationsRepository.updateExpiration(invitation.id, 14);

      // New expiration should be ~14 days from now
      const now = new Date();
      const expectedExpiry = new Date(now);
      expectedExpiry.setDate(expectedExpiry.getDate() + 14);

      const timeDiff = Math.abs(updated.expiresAt.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(2000); // Within 2 seconds
    });
  });
});
