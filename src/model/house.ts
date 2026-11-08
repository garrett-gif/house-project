import type { HouseModel, Room, RoomType } from './types'
import { ft, p } from './geometry'

const r = (id: string, name: string, type: RoomType, x: number, y: number, w: number, d: number, bathId?: string): Room => ({
  id, name, type, rect: { x: ft(x), y: ft(y), w: ft(w), d: ft(d) }, bathId,
})

function kidsRooms(): Room[] {
  const rooms: Room[] = []
  for (let i = 0; i < 4; i++) {
    const n = i + 1, x = i * 20
    rooms.push(r(`kid-${n}`, `Kid bedroom ${n}`, 'bedroom', x, 0, 20, 20, `kid-${n}-bath`))
    rooms.push(r(`kid-${n}-bath`, `Bath ${n}`, 'bath', x, 20, 20, 10))
  }
  for (let i = 0; i < 3; i++) {
    const n = i + 5, x = i * 20
    rooms.push(r(`kid-${n}-bath`, `Bath ${n}`, 'bath', x, 40, 20, 10))
    rooms.push(r(`kid-${n}`, `Kid bedroom ${n}`, 'bedroom', x, 50, 20, 20, `kid-${n}-bath`))
  }
  return rooms
}

/**
 * Placeholder massing for testing the model and views, not a finished design.
 * Room coordinates are local to the house: 0,0 is the southwest corner of the main block.
 */
export const mainHouse: HouseModel = {
  buildingId: 'main-house',
  origin: p(1060, 5415),
  concept: true,
  levels: [
    {
      id: 'walkout', name: 'Walkout level', elevation: ft(-11), floorHeight: ft(11),
      rooms: [
        r('indoor-pool', 'Indoor pool', 'pool', -70, 0, 70, 60),
        r('spa', 'Spa', 'wellness', 0, 0, 34, 34),
        r('gym', 'Gym', 'wellness', 34, 0, 40, 34),
        r('craft', 'Family craft room', 'living', 74, 0, 46, 34),
        r('w-hall', 'Hall', 'circulation', 0, 34, 120, 6),
        r('theater', '20-seat theater', 'living', 0, 40, 40, 30),
        r('concessions', 'Candy wall and concessions', 'service', 40, 40, 16, 30),
        r('w-bath', 'Bath', 'bath', 56, 40, 14, 30),
        r('mech', 'Mechanical', 'service', 70, 40, 14, 30),
        r('w-stair', 'Stairs', 'circulation', 84, 40, 16, 30),
        r('wood', 'Dust-controlled woodshop', 'service', 100, 40, 20, 30),
      ],
    },
    {
      id: 'main', name: 'Main floor', elevation: 0, floorHeight: ft(11),
      rooms: [
        r('primary', 'Primary and sitting area', 'bedroom', 0, 0, 36, 34, 'bath-his'),
        r('foyer', 'Foyer', 'circulation', 36, 0, 12, 34),
        r('great', 'Great room', 'living', 48, 0, 32, 34),
        r('kitchen', 'Eat-in kitchen', 'living', 80, 0, 40, 34),
        r('m-hall', 'Hall', 'circulation', 0, 34, 120, 6),
        r('bath-his', 'His bath', 'bath', 0, 40, 14, 15),
        r('bath-hers', 'Her bath', 'bath', 14, 40, 16, 15),
        r('closet-his', 'His closet', 'service', 0, 55, 14, 15),
        r('closet-hers', 'Her closet', 'service', 14, 55, 16, 15),
        r('vanity', 'Vanity', 'service', 30, 40, 10, 30),
        r('office', 'Home office', 'living', 40, 40, 30, 30),
        r('powder', 'Powder room', 'bath', 70, 40, 14, 15),
        r('pantry', 'Pantry', 'service', 70, 55, 14, 15),
        r('m-stair', 'Stairs', 'circulation', 84, 40, 16, 30),
        r('scullery', 'Scullery kitchen', 'service', 100, 40, 20, 30),
        r('garage', '3-car garage', 'garage', 120, 0, 36, 26),
      ],
    },
    {
      id: 'upper', name: 'Kids floor', elevation: ft(11), floorHeight: ft(10),
      rooms: [
        ...kidsRooms(),
        r('kids-living', 'Kids living area', 'living', 80, 0, 40, 30),
        r('u-hall', 'Hall', 'circulation', 0, 30, 120, 10),
        r('hall-bath', 'Hall bath', 'bath', 60, 40, 15, 30),
        r('kids-laundry', 'Laundry', 'service', 75, 40, 9, 30),
        r('u-stair', 'Stairs', 'circulation', 84, 40, 16, 30),
        r('other-bed', 'Other bedroom', 'bedroom', 100, 50, 20, 20, 'other-bath'),
        r('other-bath', 'Bath', 'bath', 100, 40, 20, 10),
      ],
    },
  ],
}
