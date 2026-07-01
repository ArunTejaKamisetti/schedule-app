import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// `supabase/setup.sql` is the one-paste install: every migration concatenated in order, so a new
// college can stand up the whole database in a single Supabase SQL-editor run (see SETUP.md). This
// guards the invariant that keeps that promise true — if someone adds a migration and forgets to
// append it to setup.sql (or edits a migration without regenerating), the one-paste install would
// silently drift from the real schema. These tests fail loudly instead.

const MIGRATIONS_DIR = fileURLToPath(new URL('../supabase/migrations', import.meta.url))
const SETUP_SQL = fileURLToPath(new URL('../supabase/setup.sql', import.meta.url))

// Normalize EOLs so a CRLF/LF rewrite in one file but not the other doesn't cause a false failure.
const lf = (s: string) => s.replace(/\r\n/g, '\n')

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort() // zero-padded numeric prefixes sort lexicographically in apply order
}

describe('supabase/setup.sql (one-paste install stays in sync with migrations)', () => {
  const setup = lf(readFileSync(SETUP_SQL, 'utf8'))
  const files = migrationFiles()

  it('finds migration files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('contains every migration verbatim', () => {
    const missing = files.filter((f) => !setup.includes(lf(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')).trim()))
    expect(missing).toEqual([])
  })

  it('includes the migrations in apply order', () => {
    const positions = files.map((f) => setup.indexOf(lf(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')).trim()))
    const sorted = [...positions].sort((a, b) => a - b)
    expect(positions).toEqual(sorted)
  })
})
