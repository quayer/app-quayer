#!/usr/bin/env node
/**
 * Applies pending Prisma SQL migrations using pg directly.
 * On a fresh database: applies the init migration then marks all historical
 * incremental migrations as already-applied (they are baked into the init snapshot).
 * On an existing database: only applies new migration SQL files.
 * Safe to run multiple times (idempotent).
 */
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const INIT_MIGRATION = '20250101000000_init'

async function isFreshDatabase(client) {
  const { rows } = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'User'
    ) AS exists
  `)
  return !rows[0].exists
}

async function markAsApplied(client, name) {
  const checksum = 'pre-existing'
  await client.query(
    `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
     VALUES ($1, $2, NOW(), $3, 1) ON CONFLICT (id) DO NOTHING`,
    [crypto.randomUUID(), checksum, name]
  )
}

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        id                  VARCHAR(36)  NOT NULL PRIMARY KEY,
        checksum            VARCHAR(64)  NOT NULL,
        finished_at         TIMESTAMPTZ,
        migration_name      VARCHAR(255) NOT NULL,
        logs                TEXT,
        rolled_back_at      TIMESTAMPTZ,
        started_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        applied_steps_count INTEGER      NOT NULL DEFAULT 0
      )
    `)

    const migrationsDir = path.join(__dirname, 'migrations')
    const dirs = fs.readdirSync(migrationsDir)
      .filter(d => fs.statSync(path.join(migrationsDir, d)).isDirectory())
      .sort()

    const fresh = await isFreshDatabase(client)

    if (fresh) {
      console.log('Fresh database detected — applying full schema snapshot...')
      const initSql = path.join(migrationsDir, INIT_MIGRATION, 'migration.sql')
      if (!fs.existsSync(initSql)) {
        throw new Error(`Init migration not found: ${initSql}`)
      }
      const sql = fs.readFileSync(initSql, 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('COMMIT')
        console.log(`✅ Schema snapshot applied`)
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      }

      // Mark ALL migration dirs (including incremental ones) as applied
      // since the init snapshot already contains their changes.
      for (const dir of dirs) {
        await markAsApplied(client, dir)
      }
      console.log(`✅ Marked ${dirs.length} migration(s) as applied`)
      return
    }

    // Existing database: apply only new incremental migrations
    const { rows: applied } = await client.query(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'
    )
    const appliedSet = new Set(applied.map(r => r.migration_name))

    let count = 0
    for (const dir of dirs) {
      if (dir === INIT_MIGRATION) continue // skip snapshot migration on existing DB
      if (appliedSet.has(dir)) continue

      const sqlFile = path.join(migrationsDir, dir, 'migration.sql')
      if (!fs.existsSync(sqlFile)) {
        await markAsApplied(client, dir) // mark empty dirs as applied
        continue
      }

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

    console.log(count === 0 ? '✅ No pending migrations' : `✅ Applied ${count} migration(s)`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => {
  console.error('❌ Migration failed:', e.message)
  process.exit(1)
})
