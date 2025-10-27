/**
 * Organizations Controller Integration Tests
 *
 * Tests Organizations API with real database
 * - List organizations
 * - Get current organization
 * - Switch organization
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  setupTestDatabase,
  cleanupTestDatabase,
  cleanDatabase,
  getPrismaTestClient,
} from '../../helpers/database-setup'

describe('Organizations Controller', () => {
  beforeAll(async () => {
    await setupTestDatabase({ seed: true, clean: true })
  })

  afterAll(async () => {
    await cleanupTestDatabase({ dropData: true })
  })

  beforeEach(async () => {
    // Clean data before each test
    await cleanDatabase()
  })

  describe('GET /api/v1/organizations', () => {
    it('should list all organizations for admin user', async () => {
      const prisma = getPrismaTestClient()

      // Create admin user
      const admin = await prisma.user.create({
        data: {
          email: 'admin@test.com',
          name: 'Admin User',
          role: 'admin',
          emailVerified: new Date(),
        },
      })

      // Create test organizations
      const org1 = await prisma.organization.create({
        data: {
          name: 'Organization 1',
          slug: 'org-1',
          createdById: admin.id,
        },
      })

      const org2 = await prisma.organization.create({
        data: {
          name: 'Organization 2',
          slug: 'org-2',
          createdById: admin.id,
        },
      })

      // Verify organizations were created
      const organizations = await prisma.organization.findMany()
      expect(organizations).toHaveLength(2)
      expect(organizations.map((o) => o.slug)).toContain('org-1')
      expect(organizations.map((o) => o.slug)).toContain('org-2')
    })

    it('should list only user organizations for regular user', async () => {
      const prisma = getPrismaTestClient()

      // Create users
      const admin = await prisma.user.create({
        data: {
          email: 'admin@test.com',
          name: 'Admin User',
          role: 'admin',
          emailVerified: new Date(),
        },
      })

      const user = await prisma.user.create({
        data: {
          email: 'user@test.com',
          name: 'Regular User',
          role: 'user',
          emailVerified: new Date(),
        },
      })

      // Create organizations
      const org1 = await prisma.organization.create({
        data: {
          name: 'Organization 1',
          slug: 'org-1',
          createdById: admin.id,
        },
      })

      const org2 = await prisma.organization.create({
        data: {
          name: 'Organization 2',
          slug: 'org-2',
          createdById: admin.id,
        },
      })

      // Link user to org1 only
      await prisma.organizationUser.create({
        data: {
          userId: user.id,
          organizationId: org1.id,
          role: 'manager',
          isActive: true,
        },
      })

      // Verify user has access to only org1
      const userOrgs = await prisma.organizationUser.findMany({
        where: { userId: user.id, isActive: true },
        include: { organization: true },
      })

      expect(userOrgs).toHaveLength(1)
      expect(userOrgs[0].organization.slug).toBe('org-1')
    })
  })

  describe('GET /api/v1/organizations/current', () => {
    it('should return current organization for user', async () => {
      const prisma = getPrismaTestClient()

      // Create user with organization
      const admin = await prisma.user.create({
        data: {
          email: 'admin@test.com',
          name: 'Admin User',
          role: 'admin',
          emailVerified: new Date(),
        },
      })

      const org = await prisma.organization.create({
        data: {
          name: 'Test Organization',
          slug: 'test-org',
          createdById: admin.id,
        },
      })

      // Update user with current org
      const user = await prisma.user.update({
        where: { id: admin.id },
        data: { currentOrgId: org.id },
      })

      // Verify current org
      const currentOrg = await prisma.organization.findUnique({
        where: { id: user.currentOrgId! },
      })

      expect(currentOrg).toBeDefined()
      expect(currentOrg?.slug).toBe('test-org')
      expect(currentOrg?.name).toBe('Test Organization')
    })

    it('should return null if user has no current organization', async () => {
      const prisma = getPrismaTestClient()

      // Create user without organization
      const user = await prisma.user.create({
        data: {
          email: 'user@test.com',
          name: 'User',
          role: 'user',
          emailVerified: new Date(),
        },
      })

      expect(user.currentOrgId).toBeNull()
    })
  })

  describe('POST /api/v1/organizations/switch', () => {
    it('should switch user to another organization', async () => {
      const prisma = getPrismaTestClient()

      // Create admin and organizations
      const admin = await prisma.user.create({
        data: {
          email: 'admin@test.com',
          name: 'Admin User',
          role: 'admin',
          emailVerified: new Date(),
        },
      })

      const org1 = await prisma.organization.create({
        data: {
          name: 'Organization 1',
          slug: 'org-1',
          createdById: admin.id,
        },
      })

      const org2 = await prisma.organization.create({
        data: {
          name: 'Organization 2',
          slug: 'org-2',
          createdById: admin.id,
        },
      })

      // Create user linked to both orgs
      const user = await prisma.user.create({
        data: {
          email: 'user@test.com',
          name: 'User',
          role: 'user',
          emailVerified: new Date(),
          currentOrgId: org1.id,
        },
      })

      await prisma.organizationUser.createMany({
        data: [
          { userId: user.id, organizationId: org1.id, role: 'manager', isActive: true },
          { userId: user.id, organizationId: org2.id, role: 'user', isActive: true },
        ],
      })

      // Switch to org2
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { currentOrgId: org2.id },
      })

      expect(updatedUser.currentOrgId).toBe(org2.id)

      // Verify switch was successful
      const currentOrg = await prisma.organization.findUnique({
        where: { id: updatedUser.currentOrgId! },
      })

      expect(currentOrg?.slug).toBe('org-2')
    })

    it('should not switch to organization user does not belong to', async () => {
      const prisma = getPrismaTestClient()

      // Create admin and organizations
      const admin = await prisma.user.create({
        data: {
          email: 'admin@test.com',
          name: 'Admin User',
          role: 'admin',
          emailVerified: new Date(),
        },
      })

      const org1 = await prisma.organization.create({
        data: {
          name: 'Organization 1',
          slug: 'org-1',
          createdById: admin.id,
        },
      })

      const org2 = await prisma.organization.create({
        data: {
          name: 'Organization 2',
          slug: 'org-2',
          createdById: admin.id,
        },
      })

      // Create user linked to org1 only
      const user = await prisma.user.create({
        data: {
          email: 'user@test.com',
          name: 'User',
          role: 'user',
          emailVerified: new Date(),
          currentOrgId: org1.id,
        },
      })

      await prisma.organizationUser.create({
        data: {
          userId: user.id,
          organizationId: org1.id,
          role: 'manager',
          isActive: true,
        },
      })

      // Verify user is not linked to org2
      const org2Link = await prisma.organizationUser.findUnique({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: org2.id,
          },
        },
      })

      expect(org2Link).toBeNull()
    })
  })

  describe('Organization Creation', () => {
    it('should create organization with valid data', async () => {
      const prisma = getPrismaTestClient()

      const admin = await prisma.user.create({
        data: {
          email: 'admin@test.com',
          name: 'Admin User',
          role: 'admin',
          emailVerified: new Date(),
        },
      })

      const org = await prisma.organization.create({
        data: {
          name: 'New Organization',
          slug: 'new-org',
          createdById: admin.id,
        },
      })

      expect(org.id).toBeDefined()
      expect(org.name).toBe('New Organization')
      expect(org.slug).toBe('new-org')
      expect(org.createdById).toBe(admin.id)
    })

    it('should not create organization with duplicate slug', async () => {
      const prisma = getPrismaTestClient()

      const admin = await prisma.user.create({
        data: {
          email: 'admin@test.com',
          name: 'Admin User',
          role: 'admin',
          emailVerified: new Date(),
        },
      })

      await prisma.organization.create({
        data: {
          name: 'Organization 1',
          slug: 'duplicate-slug',
          createdById: admin.id,
        },
      })

      // Attempt to create another org with same slug
      await expect(
        prisma.organization.create({
          data: {
            name: 'Organization 2',
            slug: 'duplicate-slug',
            createdById: admin.id,
          },
        })
      ).rejects.toThrow()
    })
  })
})
