import { describe, expect, it } from 'vitest'
import { sampleEstate } from '../model/sampleEstate'
import { applyOperations } from '../model/edits'
import { placeOpenings } from '../model/walls'
import { ft } from '../model/geometry'
import { buildingDragOp, deviceDragOp, grabRoom, openingDragOp, roomDragOp, snap, utilityDragOp } from './dragOps'

const room = (id: string) => sampleEstate.house.levels.flatMap(l => l.rooms).find(r => r.id === id)!

describe('drag to edit', () => {
  it('snaps to the grid', () => {
    expect(snap(17, 6)).toBe(18)
    expect(snap(-4, 6)).toBe(-6)
    expect(snap(2, 6)).toBe(0)
  })

  it('grabs a wall near an edge and the room elsewhere', () => {
    const k = room('kitchen') // x 48..96 ft, y 64..88 ft
    expect(grabRoom(k, ft(95.5), ft(76))).toEqual({ kind: 'wall', side: 'e' })
    expect(grabRoom(k, ft(60), ft(64.5))).toEqual({ kind: 'wall', side: 's' })
    expect(grabRoom(k, ft(70), ft(76))).toEqual({ kind: 'room' })
  })

  it('turns a drag on the kitchen east wall into moveWall, which the great room makes room for', () => {
    const op = roomDragOp(room('kitchen'), { kind: 'wall', side: 'e' }, ft(10) + 2, 0)!
    expect(op).toEqual({ op: 'moveWall', roomId: 'kitchen', side: 'e', distance: ft(10) })
    expect(applyOperations(sampleEstate, [op]).ok).toBe(true)
  })

  it('treats dragging a west or south wall outward as growing the room', () => {
    expect(roomDragOp(room('kitchen'), { kind: 'wall', side: 'w' }, ft(-2), 0)).toMatchObject({ side: 'w', distance: ft(2) })
    expect(roomDragOp(room('kitchen'), { kind: 'wall', side: 's' }, 0, ft(3))).toMatchObject({ side: 's', distance: ft(-3) })
  })

  it('ignores tiny drags', () => {
    expect(roomDragOp(room('kitchen'), { kind: 'room' }, 2, -1)).toBeNull()
    expect(buildingDragOp(sampleEstate.buildings[1], 3, 4)).toBeNull()
  })

  it('moving a room onto its neighbor is a drag the edit layer refuses', () => {
    const op = roomDragOp(room('kitchen'), { kind: 'room' }, ft(10), 0)!
    const r = applyOperations(sampleEstate, [op])
    expect(r.ok).toBe(false)
  })

  it('slides a door along its wall', () => {
    const door = placeOpenings(sampleEstate.house).find(o => o.roomId === 'kitchen' && o.leadsTo === 'm-hall')!
    const op = openingDragOp(door, ft(6) + 1, ft(3))!
    expect(op).toEqual({ op: 'moveOpening', openingId: door.id, side: door.side, offset: door.offset + ft(6) })
    expect(applyOperations(sampleEstate, [op]).ok).toBe(true)
  })

  it('moves a building on the site by whole feet', () => {
    const shop = sampleEstate.buildings.find(b => b.id === 'forestry-shop')!
    expect(buildingDragOp(shop, ft(40) + 5, ft(-12) - 3)).toEqual({ op: 'moveBuilding', buildingId: 'forestry-shop', dx: ft(40), dy: ft(-12) })
  })

  it('moves utilities, cameras, and lights by whole feet, through edits the checks see', () => {
    const well = sampleEstate.utilities!.find(u => u.id === 'estate-well')!
    const op = utilityDragOp(well, ft(-15) + 4, 3)!
    expect(op).toEqual({ op: 'moveUtility', utilityId: 'estate-well', dx: ft(-15), dy: 0 })
    expect(applyOperations(sampleEstate, [op]).ok).toBe(true)
    const cam = sampleEstate.security!.find(d => d.id === 'cam-estate-gate')!
    expect(deviceDragOp(cam, 5, 5)).toBeNull()
    expect(deviceDragOp(cam, ft(-3), ft(20))).toEqual({ op: 'moveDevice', deviceId: 'cam-estate-gate', dx: ft(-3), dy: ft(20) })
  })
})
