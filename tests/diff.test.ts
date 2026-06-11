import { describe, it, expect } from 'vitest'
import { diffSheetData } from '@/lib/diff'
import { buildSheet, fmtAt, plainRow } from './helpers'
import type { CellFormat } from '@/lib/types'

const RED: CellFormat = { bgColor: '#f4cccc', strikethrough: false }
const GREEN: CellFormat = { bgColor: '#d9ead3', strikethrough: false }

// Single-row snapshots make slot bookkeeping easy to reason about.
function snap(row: string[], fmt?: CellFormat[]) {
  return buildSheet([row], fmt ? [fmt] : [plainRow(row.length)])
}

const ROW_A = ['Tuesday, 9 June, 2026', '09.15-10.30', 'GT-A', 'IAPM-A', '', '']

describe('diffSheetData', () => {
  it('first sync (no previous snapshot) marks everything added, nothing removed', () => {
    const d = diffSheetData(null, snap(ROW_A))
    expect(d.added.length).toBe(2)
    expect(d.removed).toHaveLength(0)
    expect(d.changes.every((c) => c.type === 'added')).toBe(true)
    expect(d.upserts.length).toBe(2)
  })

  it('identical snapshots produce no changes', () => {
    const prev = snap(ROW_A)
    const next = snap(ROW_A)
    expect(diffSheetData(prev, next).changes).toHaveLength(0)
  })

  it('a cell turning red = cancelled (and is_cancelled persists on the upsert)', () => {
    const prev = snap(ROW_A)
    const next = snap(ROW_A, fmtAt(2, RED))   // GT-A at col 2 goes red
    const d = diffSheetData(prev, next)
    const cancelled = d.changes.filter((c) => c.type === 'cancelled')
    expect(cancelled).toHaveLength(1)
    expect(cancelled[0].course_code).toBe('GT-A')
    expect(d.upserts.find((u) => u.course_code === 'GT-A')!.is_cancelled).toBe(true)
  })

  it('a red cell returning to normal = reinstated (added)', () => {
    const prev = snap(ROW_A, fmtAt(2, RED))
    const next = snap(ROW_A)
    const d = diffSheetData(prev, next)
    const added = d.changes.filter((c) => c.type === 'added' && c.course_code === 'GT-A')
    expect(added).toHaveLength(1)
  })

  it('a brand-new course in a previously-empty slot = added', () => {
    const prev = snap(['Tuesday, 9 June, 2026', '09.15-10.30', 'GT-A', '', '', ''])
    const next = snap(['Tuesday, 9 June, 2026', '09.15-10.30', 'GT-A', 'IAPM-A', '', ''])
    const d = diffSheetData(prev, next)
    const added = d.changes.filter((c) => c.type === 'added')
    expect(added.map((c) => c.course_code)).toEqual(['IAPM-A'])
  })

  it('a course vanishing from a slot = removed', () => {
    const prev = snap(['Tuesday, 9 June, 2026', '09.15-10.30', 'GT-A', 'IAPM-A', '', ''])
    const next = snap(['Tuesday, 9 June, 2026', '09.15-10.30', 'GT-A', '', '', ''])
    const d = diffSheetData(prev, next)
    expect(d.removed.map((r) => r.course_code)).toEqual(['IAPM-A'])
    expect(d.changes.some((c) => c.type === 'removed' && c.course_code === 'IAPM-A')).toBe(true)
  })

  it('same course moved to a different time = rescheduled with a "Moved from…" note', () => {
    const prev = buildSheet([
      ['Tuesday, 9 June, 2026', '09.15-10.30', 'GT-A', '', '', ''],
      ['Tuesday, 9 June, 2026', '10.45-12.00', '', '', '', ''],
    ])
    const next = buildSheet([
      ['Tuesday, 9 June, 2026', '09.15-10.30', '', '', '', ''],
      ['Tuesday, 9 June, 2026', '10.45-12.00', 'GT-A', '', '', ''],
    ])
    const d = diffSheetData(prev, next)
    const moved = d.changes.find((c) => c.course_code === 'GT-A')
    expect(moved?.type).toBe('rescheduled')
    expect(moved?.note).toMatch(/Moved from .* → /)
    expect(d.removed).toHaveLength(0)   // a move is not a removal
  })

  it('an in-cell edit keeping the same base abbreviation = schedule_update', () => {
    const prev = snap(['Tuesday, 9 June, 2026', '09.15-10.30', 'FC', '', '', ''])
    const next = snap(['Tuesday, 9 June, 2026', '09.15-10.30', 'FC (FIN)', '', '', ''])
    const d = diffSheetData(prev, next)
    const upd = d.changes.find((c) => c.type === 'schedule_update')
    expect(upd).toBeDefined()
    expect(upd?.note).toContain('FC → FC (FIN)')
  })

  it('a green cell on an existing class flags it as added/marked', () => {
    const prev = snap(ROW_A)
    const next = snap(ROW_A, fmtAt(2, GREEN))
    const d = diffSheetData(prev, next)
    expect(d.changes.some((c) => c.type === 'added' && c.course_code === 'GT-A')).toBe(true)
  })

  it('reads colour from each cell\'s OWN column — same code in two columns, only one cancelled', () => {
    // GUEST appears in D1 (col 2) and D2 (col 3); only D2 turns red. The old code read both
    // from the first match and missed it — this pins the column-exact behaviour.
    const row = ['Tuesday, 9 June, 2026', '09.15-10.30', 'GUEST', 'GUEST', '', '']
    const prev = snap(row)
    const next = snap(row, fmtAt(3, RED))
    const d = diffSheetData(prev, next)
    const d1 = d.upserts.find((u) => u.sheet_tab === 'PGP-29 D1' && u.course_code === 'GUEST')
    const d2 = d.upserts.find((u) => u.sheet_tab === 'PGP-29 D2' && u.course_code === 'GUEST')
    expect(d1?.is_cancelled).toBe(false)   // D1 cell is normal
    expect(d2?.is_cancelled).toBe(true)    // D2 cell is red
    expect(d.changes.filter((c) => c.type === 'cancelled').map((c) => c.new?.sheet_tab)).toEqual(['PGP-29 D2'])
  })
})
