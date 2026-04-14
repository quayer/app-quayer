/**
 * Usage Tracker Service
 *
 * Tracks organization usage (messages, storage, AI credits, contacts, API calls)
 * against their plan limits. Uses UsageRecord model with "YYYY-MM" period format.
 *
 * All storage values in MB. All monetary values in centavos.
 */

import { getDatabase } from '@/server/services/database';

// ── Types ──────────────────────────────────────────────────────────────────

type UsageField = 'messagesUsed' | 'storageUsedMb' | 'aiCreditsUsed' | 'contactsCount' | 'apiCallsCount';

interface LimitCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
}

interface CurrentUsage {
  id: string;
  organizationId: string;
  period: string;
  messagesUsed: number;
  storageUsedMb: number;
  aiCreditsUsed: number;
  contactsCount: number;
  apiCallsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns the current billing period in "YYYY-MM" format.
 */
function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// ── Service ────────────────────────────────────────────────────────────────

class UsageTrackerService {
  /**
   * Ensures a UsageRecord exists for the current period, creating one if needed.
   * Uses upsert to handle race conditions.
   */
  private async ensureRecord(orgId: string): Promise<CurrentUsage> {
    const db = getDatabase();
    const period = getCurrentPeriod();

    const record = await db.usageRecord.upsert({
      where: {
        organizationId_period: {
          organizationId: orgId,
          period,
        },
      },
      create: {
        organizationId: orgId,
        period,
        messagesUsed: 0,
        storageUsedMb: 0,
        aiCreditsUsed: 0,
        contactsCount: 0,
        apiCallsCount: 0,
      },
      update: {}, // no-op, just ensure it exists
    });

    return record;
  }

  /**
   * Increments the message usage counter for the current billing period.
   * Uses a single upsert to avoid race conditions between ensureRecord + update.
   */
  async incrementMessages(orgId: string, count = 1): Promise<void> {
    const db = getDatabase();
    const period = getCurrentPeriod();

    try {
      await db.usageRecord.upsert({
        where: {
          organizationId_period: { organizationId: orgId, period },
        },
        create: {
          organizationId: orgId,
          period,
          messagesUsed: count,
          storageUsedMb: 0,
          aiCreditsUsed: 0,
          contactsCount: 0,
          apiCallsCount: 0,
        },
        update: {
          messagesUsed: { increment: count },
        },
      });
    } catch (error) {
      console.error(`[UsageTracker] Error incrementing messages for org ${orgId}:`, error);
    }
  }

  /**
   * Increments storage usage in MB. Accepts bytes and converts.
   * Uses a single upsert to avoid race conditions.
   */
  async incrementStorage(orgId: string, bytes: number): Promise<void> {
    const db = getDatabase();
    const period = getCurrentPeriod();
    const megabytes = Math.ceil(bytes / (1024 * 1024)); // Round up to nearest MB

    if (megabytes <= 0) return;

    try {
      await db.usageRecord.upsert({
        where: {
          organizationId_period: { organizationId: orgId, period },
        },
        create: {
          organizationId: orgId,
          period,
          messagesUsed: 0,
          storageUsedMb: megabytes,
          aiCreditsUsed: 0,
          contactsCount: 0,
          apiCallsCount: 0,
        },
        update: {
          storageUsedMb: { increment: megabytes },
        },
      });
    } catch (error) {
      console.error(`[UsageTracker] Error incrementing storage for org ${orgId}:`, error);
    }
  }

  /**
   * Increments AI credits usage counter.
   * Uses a single upsert to avoid race conditions.
   */
  async incrementAiCredits(orgId: string, count = 1): Promise<void> {
    const db = getDatabase();
    const period = getCurrentPeriod();

    try {
      await db.usageRecord.upsert({
        where: {
          organizationId_period: { organizationId: orgId, period },
        },
        create: {
          organizationId: orgId,
          period,
          messagesUsed: 0,
          storageUsedMb: 0,
          aiCreditsUsed: count,
          contactsCount: 0,
          apiCallsCount: 0,
        },
        update: {
          aiCreditsUsed: { increment: count },
        },
      });
    } catch (error) {
      console.error(`[UsageTracker] Error incrementing AI credits for org ${orgId}:`, error);
    }
  }

  /**
   * Counts actual contacts for the organization and updates the usage record.
   */
  async updateContactsCount(orgId: string): Promise<void> {
    const db = getDatabase();
    const period = getCurrentPeriod();

    try {
      // Contacts entity was removed (Builder pivot); always 0.
      const count = 0;

      await db.usageRecord.upsert({
        where: {
          organizationId_period: { organizationId: orgId, period },
        },
        create: {
          organizationId: orgId,
          period,
          messagesUsed: 0,
          storageUsedMb: 0,
          aiCreditsUsed: 0,
          contactsCount: count,
          apiCallsCount: 0,
        },
        update: {
          contactsCount: count,
        },
      });
    } catch (error) {
      console.error(`[UsageTracker] Error updating contacts count for org ${orgId}:`, error);
    }
  }

  /**
   * Increments API call counter.
   * Uses a single upsert to avoid race conditions.
   */
  async incrementApiCalls(orgId: string, count = 1): Promise<void> {
    const db = getDatabase();
    const period = getCurrentPeriod();

    try {
      await db.usageRecord.upsert({
        where: {
          organizationId_period: { organizationId: orgId, period },
        },
        create: {
          organizationId: orgId,
          period,
          messagesUsed: 0,
          storageUsedMb: 0,
          aiCreditsUsed: 0,
          contactsCount: 0,
          apiCallsCount: count,
        },
        update: {
          apiCallsCount: { increment: count },
        },
      });
    } catch (error) {
      console.error(`[UsageTracker] Error incrementing API calls for org ${orgId}:`, error);
    }
  }

  /**
   * Returns the current period's usage record for the organization.
   * Creates one if it doesn't exist yet.
   */
  async getCurrentUsage(orgId: string): Promise<CurrentUsage> {
    return this.ensureRecord(orgId);
  }

  /**
   * Checks whether the organization is within a specific usage limit.
   * Returns { allowed, current, limit }.
   */
  async checkLimit(
    orgId: string,
    field: UsageField,
    limit: number
  ): Promise<LimitCheckResult> {
    const record = await this.ensureRecord(orgId);

    // Unlimited if limit is 0 or negative
    if (limit <= 0) {
      return { allowed: true, current: record[field], limit };
    }

    const current = record[field];
    return {
      allowed: current < limit,
      current,
      limit,
    };
  }
}

export const usageTracker = new UsageTrackerService();
