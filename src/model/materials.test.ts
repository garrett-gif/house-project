import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { houseByBuilding } from './houses'
import { PALETTES, floorColor, paletteOf } from './materials'
import { applyOperations } from './edits'
import { CATALOG } from './furniture'

describe('materials', () => {
  it('gives each building the look from the brief', () => {
    const style = (id: string) => houseByBuilding(sampleEstate, id)!.style
    expect(style('main-house')).toBe('mountain-modern')
    expect(style('guest-house')).toBe('mountain-modern')
    expect(style('entertainment')).toBe('mountain-modern')
    expect(style('car-building')).toBe('glass-gallery')
    expect(style('offices')).toBe('lodge')
    expect(style('wildland-shop')).toBe('metal-timber')
  })

  it('finishes floors by room type and falls back to mountain modern', () => {
    const p = PALETTES['mountain-modern']
    expect(floorColor(p, 'bath')).toBe(p.tile)
    expect(floorColor(p, 'garage')).toBe(p.slab)
    expect(floorColor(p, 'living')).toBe(p.floor)
    expect(paletteOf({ ...sampleEstate.house, style: undefined })).toBe(p)
  })

  it('changes through setStyle, detailed buildings only', () => {
    const r = applyOperations(sampleEstate, [{ op: 'setStyle', buildingId: 'guest-house', style: 'lodge' }])
    expect(r.ok && houseByBuilding(r.estate, 'guest-house')!.style).toBe('lodge')
    expect(applyOperations(sampleEstate, [{ op: 'setStyle', buildingId: 'guest-house', style: 'castle' as never }]).ok).toBe(false)
  })

  it('has stone fireplaces, built-ins, nooks, and a wine wall in the catalog', () => {
    for (const k of ['fireplace-stone-tall', 'fireplace-stone', 'fireplace-outdoor', 'outdoor-kitchen', 'built-in-shelves', 'bunk-nook', 'reading-nook', 'breakfast-banquette', 'wine-wall']) expect(CATALOG[k], k).toBeDefined()
    expect(CATALOG['fireplace-stone-tall'].h).toBeGreaterThanOrEqual(16 * 12)
    expect(CATALOG['fireplace-stone-tall'].material).toBe('stone')
  })
})
