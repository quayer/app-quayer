#!/usr/bin/env node
/**
 * Lightweight Prisma migration runner for production Docker containers.
 * Uses pg directly instead of prisma CLI (avoids ~32MB 'effect' dependency).
 * Implements the same logic as `prisma migrate deploy`.
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set')
  process.exit(1)
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()

  try {
    // Ensure _prisma_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id"                    VARCHAR(36) NOT NULL,
        "checksum"              VARCHAR(64) NOT NULL,
        "finished_at"           TIMESTAMPTZ,
        "migration_name"        VARCHAR(255) NOT NULL,
        "logs"                  TEXT,
        "rolled_back_at"        TIMESTAMPTZ,
        "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count"   INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY ("id")
      )
    `)

    // Get applied migrations
    const result = await client.query(
      'SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL ORDER BY "started_at"'
    )
    const applied = new Set(result.rows.map((r) => r.migration_name))

    // Read migration folders
    const migrationsDir = path.join(__dirname, 'migrations')
    if (!fs.existsSync(migrationsDir)) {
      console.log('📁 No migrations directory found, skipping')
      return
    }

    const folders = fs
      .readdirSync(migrationsDir)
      .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
      .sort()

    let appliedCount = 0
    for (const folder of folders) {
      if (applied.has(folder)) {
        console.log(`  ✓ ${folder} (already applied)`)
        continue
      }

      const sqlFile = path.join(migrationsDir, folder, 'migration.sql')
      if (!fs.existsSync(sqlFile)) {
        console.log(`  ⚠️ ${folder} (no migration.sql, skipping)`)
        continue
      }

      const sql = fs.readFileSync(sqlFile, 'utf8')
      const checksum = crypto.createHash('sha256').update(sql).digest('hex')
      const id = crypto.randomUUID()

      console.log(`  🔄 Applying: ${folder}`)
      const startedAt = new Date()

      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query(
          `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, checksum, folder, startedAt, new Date(), 1]
        )
        await client.query('COMMIT')
        console.log(`  ✅ Applied: ${folder}`)
        appliedCount++
        // Refresh applied set so migrations pre-marked by init SQL are respected
        const refreshed = await client.query(
          'SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL'
        )
        refreshed.rows.forEach((r) => applied.add(r.migration_name))
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${folder} failed: ${err.message}`)
      }
    }

    if (appliedCount === 0) {
      console.log('✅ Database is up to date')
    } else {
      console.log(`✅ Applied ${appliedCount} migration(s)`)
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err.message)
  process.exit(1)
})
