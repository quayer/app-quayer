#!/usr/bin/env node
/**
 * Applies pending Prisma SQL migrations using pg directly.
 * Mirrors `prisma migrate deploy` behavior but without the CLI.
 * Safe to run multiple times (idempotent).
 * Used by docker-entrypoint.sh on container startup.
 */
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        id           VARCHAR(36)  NOT NULL PRIMARY KEY,
        checksum     VARCHAR(64)  NOT NULL,
        finished_at  TIMESTAMPTZ,
        migration_name VARCHAR(255) NOT NULL,
        logs         TEXT,
        rolled_back_at TIMESTAMPTZ,
        started_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        applied_steps_count INTEGER NOT NULL DEFAULT 0
      )
    `)

    const { rows: applied } = await client.query(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'
    )
    const appliedSet = new Set(applied.map(r => r.migration_name))

    const migrationsDir = path.join(__dirname, 'migrations')
    const dirs = fs.readdirSync(migrationsDir)
      .filter(d => fs.statSync(path.join(migrationsDir, d)).isDirectory())
      .sort()

    let count = 0
    for (const dir of dirs) {
      if (appliedSet.has(dir)) continue

      const sqlFile = path.join(migrationsDir, dir, 'migration.sql')
      if (!fs.existsSync(sqlFile)) continue

      const sql = fs.readFileSync(sqlFile, 'utf8')
      const checksum = crypto.createHash('sha256').update(sql).digest('hex').slice(0, 64)
      console.log(`Applying: ${dir}`)

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
           VALUES ($1, $2, NOW(), $3, 1)`,
          [crypto.randomUUID(), checksum, dir]
        )
        await client.query('COMMIT')
        count++
        console.log(`✅ Applied: ${dir}`)
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      }
    }

    if (count === 0) {
      console.log('✅ No pending migrations')
    } else {
      console.log(`✅ Applied ${count} migration(s)`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => {
  console.error('❌ Migration failed:', e.message)
  process.exit(1)
})
