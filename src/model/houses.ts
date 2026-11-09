import type { Check, CheckStatus, Estate, HouseModel } from './types'

/**
 * Detailed buildings: the main house (`estate.house`) and any others with their own rooms (`estate.houses`), such as
 * the guest house. Room, opening, roof, and level ids are unique across all of them.
 */
export const allHouses = (e: Estate): HouseModel[] => [e.house, ...(e.houses ?? [])]
export const houseByBuilding = (e: Estate, buildingId: string) => allHouses(e).find(h => h.buildingId === buildingId)
export const houseOfRoom = (e: Estate, roomId: string) => allHouses(e).find(h => h.levels.some(l => l.rooms.some(r => r.id === roomId)))
export const houseName = (e: Estate, h: HouseModel) => e.buildings.find(b => b.id === h.buildingId)?.name ?? h.buildingId

/**
 * The estate seen with another detailed building in the `house` slot, so views, drawings, and checks written for
 * one house work on any of them. The main house moves into `houses`. For reading only.
 */
export function focusHouse(e: Estate, buildingId: string): Estate {
  const h = houseByBuilding(e, buildingId)
  if (!h || h === e.house) return e
  return { ...e, house: h, houses: allHouses(e).filter(x => x !== h) }
}

const RANK: Record<CheckStatus, number> = { pass: 0, warn: 1, fail: 2 }

/**
 * Runs house checks on every detailed building and merges results that share an id: the worst status wins, the
 * details are labeled by building, and the flagged elements are combined. With one house nothing changes.
 */
export function checksForEachHouse(e: Estate, run: (focused: Estate) => Check[]): Check[] {
  const houses = allHouses(e)
  const runs = houses.map(h => ({ name: houseName(e, h), checks: run(focusHouse(e, h.buildingId)) }))
  if (runs.length === 1) return runs[0].checks
  const ids = [...new Set(runs.flatMap(r => r.checks.map(c => c.id)))]
  return ids.map(id => {
    const found = runs.flatMap(r => r.checks.filter(c => c.id === id).map(c => ({ name: r.name, c })))
    const worst = found.reduce((a, b) => RANK[b.c.status] > RANK[a.c.status] ? b : a)
    const shown = worst.c.status === 'pass' ? found : found.filter(f => f.c.status !== 'pass')
    const elements = [...new Set(found.flatMap(f => f.c.elements ?? []))]
    return {
      id, label: found[0].c.label, status: worst.c.status,
      detail: shown.map(f => `${f.name}: ${f.c.detail}${/[.!?]$/.test(f.c.detail) ? '' : '.'}`).join(' '),
      ...(elements.length ? { elements } : {}),
    }
  })
}
