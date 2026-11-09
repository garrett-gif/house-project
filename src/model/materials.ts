import type { HouseModel, RoomType } from './types'

/**
 * Material palettes. Each detailed building has a style (`house.style`) naming one, from Garrett's brief
 * (docs/design-brief.md): mountain modern for the main house, guest house, and entertainment shop; clean metal with
 * timber for the shops; lodge for the office; a glass gallery for the car building. Views take colors from here, so
 * the look lives in the model with everything else. Colors are 0xRRGGBB.
 */
export const STYLES = ['mountain-modern', 'metal-timber', 'lodge', 'glass-gallery'] as const
export type StyleId = typeof STYLES[number]

export interface Palette {
  name: string
  /** Outside face of exterior walls above the base. */
  siding: number
  /** Stone base and fireplaces. */
  stone: number
  /** How high the stone base runs up the outside walls, in inches. 0 for none. */
  baseHeight: number
  roof: number
  /** Window frames and mullions. */
  frame: number
  glass: number
  /** Inside face of walls, and ceilings. */
  interior: number
  ceiling: number
  timber: number
  /** Floors: living spaces, wet rooms, and garages and shops. */
  floor: number
  tile: number
  slab: number
}

export const PALETTES: Record<StyleId, Palette> = {
  'mountain-modern': {
    name: 'Mountain modern: dry-stack stone base, rough-sawn timber siding, dark standing-seam roof, black windows',
    siding: 0x6b4f3a, stone: 0x8d8678, baseHeight: 36, roof: 0x2e3236, frame: 0x1c1c1c, glass: 0x9fc4d6,
    interior: 0xf2ede4, ceiling: 0xe8dcc8, timber: 0x7a5634, floor: 0xb08a62, tile: 0xd7d3cc, slab: 0x9a9a96,
  },
  'metal-timber': {
    name: 'Clean metal with timber accents: dark metal panels, stone at the people doors, timber canopies',
    siding: 0x3a3f44, stone: 0x8d8678, baseHeight: 0, roof: 0x2e3236, frame: 0x1c1c1c, glass: 0x9fc4d6,
    interior: 0xdedad2, ceiling: 0xdedad2, timber: 0x7a5634, floor: 0x9a9a96, tile: 0xd7d3cc, slab: 0x9a9a96,
  },
  lodge: {
    name: 'Lodge: heavy timber, stone base, dark roof',
    siding: 0x5e4630, stone: 0x8d8678, baseHeight: 42, roof: 0x34373a, frame: 0x1c1c1c, glass: 0x9fc4d6,
    interior: 0xefe6d6, ceiling: 0xd9c4a3, timber: 0x6e4b2c, floor: 0xa47e58, tile: 0xd7d3cc, slab: 0x9a9a96,
  },
  'glass-gallery': {
    name: 'Glass gallery: dark metal and big glass, with timber and stone',
    siding: 0x2b2d30, stone: 0x8d8678, baseHeight: 24, roof: 0x2e3236, frame: 0x1c1c1c, glass: 0xa9cddd,
    interior: 0xf4f4f2, ceiling: 0xf4f4f2, timber: 0x7a5634, floor: 0x6f6f6c, tile: 0xd7d3cc, slab: 0x6f6f6c,
  },
}

/** The building's palette. Houses without a style get mountain modern. */
export const paletteOf = (house: HouseModel): Palette => PALETTES[house.style ?? 'mountain-modern'] ?? PALETTES['mountain-modern']

/** The floor finish for a room type. */
export function floorColor(p: Palette, type: RoomType): number {
  switch (type) {
    case 'bath': case 'wellness': case 'pool': return p.tile
    case 'garage': case 'service': return p.slab
    case 'outdoor': return p.stone
    default: return p.floor
  }
}
