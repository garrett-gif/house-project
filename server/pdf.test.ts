import { describe, expect, it } from 'vitest'
import { sheetsToPdf } from './pdf'
import { drawingSet } from '../src/drawings/drawingSet'
import { sampleEstate } from '../src/model/sampleEstate'

describe('sheetsToPdf', () => {
  it('writes the five-sheet set, one 36 x 24 inch page per sheet', async () => {
    const sheets = drawingSet(sampleEstate, { revision: 0, date: '2026-11-08', projectName: 'House Project' })
    const pdf = await sheetsToPdf(sheets, 'House Project, draft floor plans')
    const text = pdf.toString('latin1')
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(5)
    expect(text).toMatch(/\/MediaBox \[0 0 2592 1728\]/)
    expect(pdf.length).toBeGreaterThan(5_000)
  })
})
