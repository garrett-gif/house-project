import type { HouseModel, Room, RoomType } from './types'
import { ft, p } from './geometry'

const r = (id: string, name: string, type: RoomType, x: number, y: number, w: number, d: number, bathId?: string): Room => ({
  id, name, type, rect: { x: ft(x), y: ft(y), w: ft(w), d: ft(d) }, bathId,
})

/** Overall plan: 190 ft wide U opening south. West and east wings are 46 by 64 ft; the north bar is 190 by 44 ft. */
export const HOUSE_WIDTH = 190
export const HOUSE_DEPTH = 108
export const WING_WIDTH = 46
export const WING_DEPTH = 64
export const GARAGE_WIDTH = 38
export const GARAGE_DEPTH = 26

function kidsRooms(): Room[] {
  const rooms: Room[] = []
  for (let i = 0; i < 4; i++) {
    const n = i + 1, x = i * 24
    rooms.push(r(`kid-${n}`, `Kid bedroom ${n}`, 'bedroom', x, 64, 16, 20, `kid-${n}-bath`))
    rooms.push(r(`kid-${n}-bath`, `Bath ${n}`, 'bath', x + 16, 64, 8, 20))
  }
  for (let i = 0; i < 3; i++) {
    const n = i + 5, x = i * 24
    rooms.push(r(`kid-${n}`, `Kid bedroom ${n}`, 'bedroom', x, 90, 16, 18, `kid-${n}-bath`))
    rooms.push(r(`kid-${n}-bath`, `Bath ${n}`, 'bath', x + 16, 90, 8, 18))
  }
  return rooms
}

/**
 * Placeholder layout for testing the U-shaped arrangement, not a finished design.
 * Room coordinates are local to the house: 0,0 is the southwest corner of the west wing.
 */
export const mainHouse: HouseModel = {
  buildingId: 'main-house',
  origin: p(1060, 5360),
  concept: true,
  levels: [
    {
      id: 'walkout', name: 'Walkout level', elevation: ft(-11), floorHeight: ft(11),
      rooms: [
        r('concessions', 'Candy wall and concessions', 'service', 0, 0, 46, 16),
        r('theater', '20-seat theater', 'living', 0, 16, 46, 48),
        r('w-bath', 'Bath', 'bath', 0, 64, 14, 24),
        r('wood', 'Dust-controlled woodshop', 'service', 14, 64, 32, 24),
        r('craft', 'Family craft room', 'living', 46, 64, 50, 24),
        r('gym', 'Gym', 'wellness', 96, 64, 48, 24),
        r('spa', 'Spa', 'wellness', 144, 64, 46, 24),
        r('indoor-pool', 'Indoor pool', 'pool', 144, 0, 46, 64),
        r('w-hall', 'Gallery', 'circulation', 0, 88, 190, 6),
        r('mech', 'Mechanical', 'service', 0, 94, 60, 14),
        r('w-storage', 'Storage', 'service', 60, 94, 61, 14),
        r('w-stair', 'Stairs', 'circulation', 121, 94, 16, 14),
        r('w-bath-2', 'Bath', 'bath', 137, 94, 18, 14),
        r('w-storage-2', 'Spa storage', 'service', 155, 94, 35, 14),
      ],
    },
    {
      id: 'main', name: 'Main floor', elevation: 0, floorHeight: ft(11),
      rooms: [
        r('other-bed-2', 'Other bedroom', 'bedroom', 0, 0, 34, 28, 'other-bath-2'),
        r('other-bath-2', 'Bath', 'bath', 34, 0, 12, 28),
        r('family', 'Family room', 'living', 0, 28, 46, 36),
        r('garage', '3-car garage', 'garage', -38, 64, 38, 26),
        r('mudroom', 'Family mudroom', 'service', 0, 64, 14, 24),
        r('dining', 'Formal dining', 'living', 14, 64, 32, 24),
        r('kitchen', 'Eat-in party kitchen', 'living', 46, 64, 50, 24),
        r('great', 'Great room', 'living', 96, 64, 48, 24),
        r('office', 'Home office', 'living', 144, 64, 46, 24),
        r('m-hall', 'Gallery', 'circulation', 0, 88, 190, 6),
        r('laundry', 'Laundry', 'service', 0, 94, 20, 14),
        r('pantry', 'Pantry', 'service', 20, 94, 26, 14),
        r('scullery', 'Scullery kitchen', 'service', 46, 94, 34, 14),
        r('foyer', 'Formal foyer, north door', 'circulation', 80, 94, 25, 14),
        r('powder', 'Powder', 'bath', 105, 94, 16, 14),
        r('m-stair', 'Stairs', 'circulation', 121, 94, 16, 14),
        r('library', 'Library', 'living', 137, 94, 53, 14),
        r('terrace', 'Covered terrace, steps to pool', 'outdoor', 46, 52, 98, 12),
        r('primary', 'Primary and sitting area', 'bedroom', 144, 0, 46, 32, 'bath-his'),
        r('primary-hall', 'Hall', 'circulation', 144, 32, 6, 32),
        r('bath-his', 'His bath', 'bath', 150, 32, 12, 16),
        r('bath-hers', 'Her bath', 'bath', 162, 32, 16, 16),
        r('closet-his', 'His closet', 'service', 150, 48, 12, 16),
        r('closet-hers', 'Her closet', 'service', 162, 48, 16, 16),
        r('vanity', 'Vanity', 'service', 178, 32, 12, 32),
      ],
    },
    {
      id: 'upper', name: 'Kids floor', elevation: ft(11), floorHeight: ft(10),
      rooms: [
        ...kidsRooms(),
        r('kids-living', 'Kids living area', 'living', 96, 64, 54, 20),
        r('other-bed', 'Other bedroom', 'bedroom', 150, 64, 28, 20, 'other-bath'),
        r('other-bath', 'Bath', 'bath', 178, 64, 12, 20),
        r('u-hall', 'Hall', 'circulation', 0, 84, 190, 6),
        r('hall-bath', 'Hall bath', 'bath', 72, 90, 16, 18),
        r('kids-laundry', 'Laundry', 'service', 88, 90, 10, 18),
        r('homework', 'Homework room', 'living', 98, 90, 23, 18),
        r('u-landing', 'Landing', 'circulation', 121, 90, 16, 4),
        r('u-stair', 'Stairs', 'circulation', 121, 94, 16, 14),
        r('playroom', 'Playroom', 'living', 137, 90, 53, 18),
      ],
    },
  ],
}
