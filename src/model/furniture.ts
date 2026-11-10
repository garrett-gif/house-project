import type { Check, Estate, FurnitureItem, HouseModel, Rect, Room } from './types'
import { placeOpenings } from './walls'
import { toFt } from './geometry'

/**
 * Furniture, fixtures, appliances, and machines at real sizes, in inches. Each catalog piece is drawn from the
 * back (local y = 0, the side that goes against a wall) toward its front. A placed piece stores its center in
 * house-local inches and a rotation: 0 faces north with its back to the south, 90 faces west with its back to the
 * east, 180 faces south, 270 faces east.
 */
export type FurnitureCategory = 'seating' | 'bed' | 'table' | 'storage' | 'kitchen' | 'bath' | 'equipment' | 'fixture' | 'vehicle' | 'outdoor'
/** How the first pass places a piece: back against a wall, in the middle of the room, or anywhere on the floor. */
export type Placement = 'wall' | 'center' | 'floor'
export interface Part { name: string; x: number; y: number; w: number; d: number; h: number }
export interface CatalogEntry {
  name: string; w: number; d: number; h: number; category: FurnitureCategory; place: Placement
  /** Walking room kept clear in front of it, and all around it. */
  front?: number; around?: number
  /** Seats it provides, for the theater and dining counts. */
  seats?: number
  /** Electrical load in kW, for machines. */
  kw?: number
  /** Goes on a short wall, as a theater screen does, leaving the long dimension for what faces it. */
  shortWall?: boolean
  parts?: Part[]
  /** Drawn in the building's stone or timber rather than by category. */
  material?: 'stone' | 'timber'
}

const p = (name: string, x: number, y: number, w: number, d: number, h: number): Part => ({ name, x, y, w, d, h })
const row = (name: string, n: number, w: number, d: number, h: number, gap: number, x0: number, y: number) => Array.from({ length: n }, (_, i) => p(name, x0 + i * (w + gap), y, w, d, h))

export const CATALOG: Record<string, CatalogEntry> = {
  // Beds and bedroom pieces.
  'king-bed-set': { name: 'King bed and nightstands', w: 128, d: 86, h: 24, category: 'bed', place: 'wall', front: 30, parts: [p('Nightstand', 0, 0, 24, 18, 26), p('King bed', 24, 0, 80, 86, 24), p('Nightstand', 104, 0, 24, 18, 26)] },
  'queen-bed-set': { name: 'Queen bed and nightstands', w: 112, d: 86, h: 24, category: 'bed', place: 'wall', front: 30, parts: [p('Nightstand', 0, 0, 24, 18, 26), p('Queen bed', 24, 0, 64, 86, 24), p('Nightstand', 88, 0, 24, 18, 26)] },
  'twin-bed': { name: 'Twin bed', w: 42, d: 80, h: 24, category: 'bed', place: 'wall', front: 24 },
  'bunk-bed': { name: 'Bunk bed, sleeps two', w: 44, d: 82, h: 66, category: 'bed', place: 'wall', front: 24 },
  dresser: { name: 'Dresser', w: 60, d: 20, h: 34, category: 'storage', place: 'wall', front: 30 },
  'small-dresser': { name: 'Small dresser', w: 36, d: 18, h: 34, category: 'storage', place: 'wall', front: 30 },
  desk: { name: 'Desk and chair', w: 54, d: 50, h: 30, category: 'table', place: 'wall', parts: [p('Desk', 0, 0, 54, 26, 30), p('Chair', 16, 28, 22, 22, 32)] },
  'long-desk': { name: 'Long desk, three seats', w: 144, d: 50, h: 30, category: 'table', place: 'wall', parts: [p('Desk', 0, 0, 144, 26, 30), ...row('Chair', 3, 22, 22, 32, 26, 13, 28)] },
  bookshelf: { name: 'Bookshelf', w: 36, d: 14, h: 84, category: 'storage', place: 'wall', front: 24 },
  shelving: { name: 'Shelving', w: 72, d: 18, h: 84, category: 'storage', place: 'wall', front: 30 },
  'closet-rods-short': { name: 'Closet rod and shelf', w: 48, d: 24, h: 84, category: 'storage', place: 'wall', front: 24 },
  'bath-set-compact': { name: 'Shower, toilet, and sink', w: 96, d: 36, h: 84, category: 'bath', place: 'wall', front: 24,
    parts: [p('Shower', 0, 0, 36, 36, 84), p('Toilet', 44, 0, 20, 28, 30), p('Sink', 68, 0, 28, 20, 34)] },
  'toilet-stalls-3': { name: 'Three toilet stalls', w: 108, d: 60, h: 72, category: 'bath', place: 'wall', front: 42,
    parts: [0, 36, 72].flatMap(x => [p('Toilet', x + 8, 0, 20, 28, 30), p('Stall partition', x + 35, 0, 1, 60, 72)]) },
  'lav-counter-3': { name: 'Counter with three sinks', w: 108, d: 24, h: 34, category: 'bath', place: 'wall', front: 36,
    parts: [p('Counter', 0, 0, 108, 24, 34), ...[18, 54, 90].map(x => p('Sink', x - 9, 4, 18, 14, 35))] },
  'pantry-wall': { name: 'Tall cabinets and pantry wall', w: 96, d: 26, h: 96, category: 'kitchen', place: 'wall', front: 42, material: 'timber' },
  'closet-rods': { name: 'Closet rods and shelves', w: 96, d: 24, h: 84, category: 'storage', place: 'wall', front: 30 },
  // Seating groups and living pieces.
  'living-group': { name: 'Sofa, coffee table, two chairs', w: 132, d: 124, h: 30, category: 'seating', place: 'wall', seats: 5,
    parts: [p('Sofa', 21, 0, 90, 38, 30), p('Coffee table', 42, 56, 48, 24, 18), p('Chair', 14, 90, 34, 34, 32), p('Chair', 84, 90, 34, 34, 32)] },
  'sectional-group': { name: 'Sectional, coffee table, two chairs', w: 192, d: 150, h: 30, category: 'seating', place: 'wall', seats: 8,
    parts: [p('Sectional', 0, 0, 150, 38, 30), p('Chaise', 0, 38, 38, 72, 30), p('Coffee table', 66, 62, 54, 36, 18), p('Chair', 158, 50, 34, 34, 32), p('Chair', 158, 100, 34, 34, 32)] },
  sofa: { name: 'Sofa', w: 90, d: 38, h: 30, category: 'seating', place: 'wall', front: 18, seats: 3 },
  'armchair-pair': { name: 'Two armchairs and a side table', w: 92, d: 34, h: 32, category: 'seating', place: 'wall', front: 24, seats: 2,
    parts: [p('Chair', 0, 0, 34, 34, 32), p('Side table', 35, 6, 22, 22, 22), p('Chair', 58, 0, 34, 34, 32)] },
  armchair: { name: 'Reading chair', w: 34, d: 34, h: 32, category: 'seating', place: 'floor', front: 18, seats: 1 },
  'window-seat': { name: 'Window seat', w: 72, d: 24, h: 18, category: 'seating', place: 'wall', front: 24, seats: 2 },
  'tv-console': { name: 'TV and console', w: 72, d: 18, h: 24, category: 'storage', place: 'wall' },
  'console-table': { name: 'Console table', w: 60, d: 16, h: 30, category: 'table', place: 'wall' },
  bench: { name: 'Bench', w: 60, d: 18, h: 18, category: 'seating', place: 'wall', front: 18, seats: 2 },
  piano: { name: 'Grand piano', w: 60, d: 70, h: 40, category: 'fixture', place: 'floor', around: 24 },
  // Tables with their chairs.
  'dining-12': { name: 'Dining table for 12', w: 192, d: 96, h: 30, category: 'table', place: 'center', around: 30, seats: 12,
    parts: [p('Table', 24, 24, 144, 48, 30), ...row('Chair', 5, 20, 20, 36, 8, 32, 2), ...row('Chair', 5, 20, 20, 36, 8, 32, 74), p('Chair', 2, 38, 20, 20, 36), p('Chair', 170, 38, 20, 20, 36)] },
  'dining-8': { name: 'Dining table for 8', w: 144, d: 90, h: 30, category: 'table', place: 'center', around: 30, seats: 8,
    parts: [p('Table', 24, 24, 96, 42, 30), ...row('Chair', 3, 20, 20, 36, 8, 34, 2), ...row('Chair', 3, 20, 20, 36, 8, 34, 68), p('Chair', 2, 35, 20, 20, 36), p('Chair', 122, 35, 20, 20, 36)] },
  'kitchen-table-6': { name: 'Kitchen table for 6', w: 120, d: 88, h: 30, category: 'table', place: 'center', around: 24, seats: 6,
    parts: [p('Table', 24, 24, 72, 40, 30), ...row('Chair', 2, 20, 20, 36, 12, 40, 2), ...row('Chair', 2, 20, 20, 36, 12, 40, 66), p('Chair', 2, 34, 20, 20, 36), p('Chair', 98, 34, 20, 20, 36)] },
  'game-table-4': { name: 'Game table for 4', w: 96, d: 96, h: 30, category: 'table', place: 'center', around: 18, seats: 4,
    parts: [p('Table', 24, 24, 48, 48, 30), p('Chair', 38, 2, 20, 20, 36), p('Chair', 38, 74, 20, 20, 36), p('Chair', 2, 38, 20, 20, 36), p('Chair', 74, 38, 20, 20, 36)] },
  // Kitchen, laundry, bar.
  'kitchen-island': { name: 'Kitchen island with stools', w: 120, d: 72, h: 36, category: 'kitchen', place: 'center', around: 42, seats: 4,
    parts: [p('Island', 0, 0, 120, 48, 36), ...row('Stool', 4, 18, 18, 30, 16, 6, 52)] },
  'island-table': { name: 'Island with a table for 6 built onto its end', w: 220, d: 88, h: 36, category: 'kitchen', place: 'center', around: 36, seats: 6,
    parts: [p('Island', 0, 20, 120, 48, 36), p('Table', 120, 22, 76, 44, 30), p('Chair', 130, 0, 20, 20, 36), p('Chair', 166, 0, 20, 20, 36), p('Chair', 130, 68, 20, 20, 36), p('Chair', 166, 68, 20, 20, 36), p('Chair', 198, 34, 20, 20, 36), ...row('Stool', 3, 18, 18, 30, 18, 12, 70)] },
  'counter-range': { name: 'Counter with range and hood', w: 144, d: 26, h: 36, category: 'kitchen', place: 'wall', front: 42, kw: 9, parts: [p('Counter', 0, 0, 48, 26, 36), p('Range', 48, 0, 48, 26, 36), p('Counter', 96, 0, 48, 26, 36)] },
  'counter-sink': { name: 'Counter with sink and dishwasher', w: 120, d: 26, h: 36, category: 'kitchen', place: 'wall', front: 42, kw: 1.5, parts: [p('Counter', 0, 0, 48, 26, 36), p('Sink', 48, 0, 36, 26, 36), p('Dishwasher', 84, 0, 24, 26, 36), p('Counter', 108, 0, 12, 26, 36)] },
  fridge: { name: 'Refrigerator and freezer', w: 48, d: 30, h: 84, category: 'kitchen', place: 'wall', front: 42, kw: 0.8 },
  'pantry-shelves': { name: 'Pantry shelves', w: 72, d: 18, h: 84, category: 'storage', place: 'wall', front: 30 },
  'bar-counter': { name: 'Bar counter with stools', w: 120, d: 54, h: 42, category: 'kitchen', place: 'wall', seats: 4, parts: [p('Bar', 0, 0, 120, 24, 42), ...row('Stool', 4, 18, 18, 30, 12, 9, 32)] },
  'laundry-pair': { name: 'Washer and dryer', w: 56, d: 30, h: 38, category: 'kitchen', place: 'wall', front: 42, kw: 6, parts: [p('Washer', 0, 0, 27, 30, 38), p('Dryer', 29, 0, 27, 30, 38)] },
  'folding-counter': { name: 'Folding counter', w: 72, d: 26, h: 36, category: 'kitchen', place: 'wall', front: 36 },
  // Baths.
  toilet: { name: 'Toilet', w: 20, d: 30, h: 30, category: 'bath', place: 'wall', front: 21 },
  'vanity-single': { name: 'Vanity', w: 36, d: 22, h: 34, category: 'bath', place: 'wall', front: 30 },
  'vanity-double': { name: 'Double vanity', w: 72, d: 22, h: 34, category: 'bath', place: 'wall', front: 30 },
  shower: { name: 'Shower', w: 60, d: 36, h: 84, category: 'bath', place: 'wall', front: 24 },
  'shower-small': { name: 'Shower', w: 36, d: 36, h: 84, category: 'bath', place: 'wall', front: 24 },
  tub: { name: 'Soaking tub', w: 66, d: 32, h: 22, category: 'bath', place: 'wall', front: 30 },
  lockers: { name: 'Lockers', w: 96, d: 18, h: 72, category: 'storage', place: 'wall', front: 36 },
  cubbies: { name: 'Lockers and cubbies with bench', w: 120, d: 20, h: 84, category: 'storage', place: 'wall', front: 36 },
  'dog-wash': { name: 'Dog wash', w: 48, d: 36, h: 36, category: 'bath', place: 'wall', front: 36 },
  // Garage and shops.
  car: { name: 'Car', w: 76, d: 200, h: 58, category: 'vehicle', place: 'floor', around: 24 },
  workbench: { name: 'Workbench', w: 96, d: 30, h: 36, category: 'equipment', place: 'wall', front: 36 },
  'table-saw': { name: 'Cabinet table saw with outfeed', w: 60, d: 72, h: 36, category: 'equipment', place: 'floor', around: 36, kw: 3.7 },
  bandsaw: { name: 'Bandsaw', w: 30, d: 30, h: 72, category: 'equipment', place: 'wall', front: 36, kw: 1.5 },
  jointer: { name: 'Jointer', w: 72, d: 24, h: 36, category: 'equipment', place: 'wall', front: 36, kw: 1.5 },
  planer: { name: 'Planer', w: 30, d: 30, h: 48, category: 'equipment', place: 'wall', front: 42, kw: 3.7 },
  'drill-press': { name: 'Drill press', w: 24, d: 24, h: 66, category: 'equipment', place: 'wall', front: 30, kw: 0.75 },
  'dust-collector': { name: 'Dust collector', w: 36, d: 36, h: 84, category: 'equipment', place: 'wall', front: 18, kw: 2.2 },
  'lumber-rack': { name: 'Lumber rack', w: 96, d: 18, h: 84, category: 'storage', place: 'wall', front: 30 },
  'craft-table': { name: 'Craft table', w: 72, d: 36, h: 36, category: 'table', place: 'center', around: 30 },
  'sewing-table': { name: 'Sewing table', w: 48, d: 24, h: 30, category: 'table', place: 'wall', front: 30, kw: 0.2 },
  'printer-bench': { name: '3D printer bench', w: 60, d: 24, h: 30, category: 'equipment', place: 'wall', front: 30, kw: 1 },
  // Theater.
  'theater-seating-20': { name: 'Theater recliners, 4 rows of 5', w: 190, d: 220, h: 40, category: 'seating', place: 'center', around: 24, seats: 20,
    parts: [0, 60, 120, 180].flatMap(y => row('Recliner', 5, 38, 40, 40, 0, 0, y)) },
  'theater-screen': { name: 'Screen and speakers', w: 192, d: 12, h: 108, category: 'fixture', place: 'wall', front: 48, shortWall: true },
  'candy-wall': { name: 'Candy wall and soda', w: 120, d: 18, h: 84, category: 'storage', place: 'wall', front: 36, kw: 1 },
  'popcorn-cart': { name: 'Popcorn machine', w: 30, d: 24, h: 66, category: 'equipment', place: 'wall', front: 30, kw: 1.4 },
  // Gym and spa.
  treadmill: { name: 'Treadmill', w: 36, d: 84, h: 60, category: 'equipment', place: 'floor', around: 24, kw: 2.2 },
  'power-rack': { name: 'Power rack and platform', w: 96, d: 96, h: 90, category: 'equipment', place: 'floor', around: 24 },
  'dumbbell-rack': { name: 'Dumbbell rack', w: 72, d: 24, h: 36, category: 'equipment', place: 'wall', front: 48 },
  rower: { name: 'Rower', w: 24, d: 96, h: 20, category: 'equipment', place: 'floor', around: 18 },
  bike: { name: 'Exercise bike', w: 24, d: 48, h: 48, category: 'equipment', place: 'floor', around: 18, kw: 0.2 },
  reformer: { name: 'Pilates reformer', w: 30, d: 96, h: 16, category: 'equipment', place: 'floor', around: 24 },
  'mat-area': { name: 'Mats and stretching', w: 96, d: 72, h: 1, category: 'equipment', place: 'floor' },
  'massage-table': { name: 'Massage table', w: 28, d: 72, h: 30, category: 'equipment', place: 'center', around: 30 },
  'salon-station': { name: 'Salon chair and station', w: 48, d: 60, h: 40, category: 'equipment', place: 'wall', parts: [p('Station', 0, 0, 48, 18, 36), p('Chair', 9, 26, 30, 30, 40)] },
  'hot-tub': { name: 'Hot tub', w: 96, d: 96, h: 36, category: 'fixture', place: 'floor', around: 24, kw: 11 },
  'cold-plunge': { name: 'Cold plunge', w: 72, d: 36, h: 36, category: 'fixture', place: 'wall', front: 24, kw: 1.5 },
  'spa-bench': { name: 'Bench', w: 72, d: 20, h: 18, category: 'seating', place: 'wall', front: 18, seats: 3 },
  'lounge-chairs': { name: 'Two lounge chairs', w: 72, d: 76, h: 18, category: 'seating', place: 'wall', seats: 2, parts: [p('Lounge chair', 0, 0, 28, 76, 18), p('Lounge chair', 44, 0, 28, 76, 18)] },
  'pool-basin': { name: 'Pool, 36 x 20 ft', w: 432, d: 240, h: 0, category: 'fixture', place: 'center', around: 48 },
  // Fire apparatus and forestry machines, stored indoors in drive-through bays. Sizes are typical, not specific models.
  'engine-t3': { name: 'Type 3 wildland engine', w: 102, d: 360, h: 120, category: 'vehicle', place: 'floor', around: 24 },
  'engine-t6': { name: 'Type 6 wildland engine', w: 96, d: 264, h: 108, category: 'vehicle', place: 'floor', around: 24 },
  'water-tender': { name: 'Water tender', w: 102, d: 384, h: 126, category: 'vehicle', place: 'floor', around: 24 },
  'crew-carrier': { name: 'Crew carrier', w: 102, d: 360, h: 126, category: 'vehicle', place: 'floor', around: 24 },
  'dozer-lowboy': { name: 'Dozer loaded on its lowboy transport', w: 144, d: 900, h: 156, category: 'vehicle', place: 'floor', around: 24 },
  'feller-buncher': { name: 'Feller buncher', w: 132, d: 336, h: 144, category: 'equipment', place: 'floor', around: 24 },
  harvester: { name: 'Harvester', w: 120, d: 420, h: 144, category: 'equipment', place: 'floor', around: 24 },
  skidder: { name: 'Skidder', w: 132, d: 300, h: 132, category: 'equipment', place: 'floor', around: 24 },
  forwarder: { name: 'Forwarder', w: 120, d: 420, h: 144, category: 'equipment', place: 'floor', around: 24 },
  'log-loader': { name: 'Log loader', w: 132, d: 420, h: 144, category: 'equipment', place: 'floor', around: 24 },
  excavator: { name: 'Excavator', w: 120, d: 384, h: 132, category: 'equipment', place: 'floor', around: 24 },
  masticator: { name: 'Masticator', w: 108, d: 300, h: 120, category: 'equipment', place: 'floor', around: 24 },
  chipper: { name: 'Chipper or grinder', w: 102, d: 360, h: 132, category: 'equipment', place: 'floor', around: 24 },
  'log-truck': { name: 'Log truck, trailer loaded on it', w: 102, d: 540, h: 156, category: 'vehicle', place: 'floor', around: 24 },
  pickup: { name: 'Pickup', w: 84, d: 240, h: 78, category: 'vehicle', place: 'floor', around: 24 },
  utv: { name: 'UTV', w: 60, d: 132, h: 78, category: 'vehicle', place: 'floor', around: 18 },
  'service-lift': { name: 'Heavy service bay with lift', w: 144, d: 600, h: 4, category: 'equipment', place: 'floor', kw: 7.5 },
  'wash-rack': { name: 'Wash bay with pressure washer', w: 144, d: 600, h: 4, category: 'equipment', place: 'floor', kw: 11 },
  'parts-racks': { name: 'Parts racks', w: 120, d: 36, h: 144, category: 'storage', place: 'wall', front: 48 },
  'welding-bench': { name: 'Welding bench and fume arm', w: 96, d: 48, h: 36, category: 'equipment', place: 'wall', front: 48, kw: 12 },
  'hose-washer': { name: 'Hose washer and drying rack', w: 144, d: 48, h: 96, category: 'equipment', place: 'wall', front: 48, kw: 3 },
  'gear-lockers': { name: 'Turnout and gear lockers', w: 144, d: 24, h: 84, category: 'storage', place: 'wall', front: 48 },
  'conference-table': { name: 'Table for 12', w: 192, d: 96, h: 30, category: 'table', place: 'center', around: 24, seats: 12, parts: [p('Table', 24, 24, 144, 48, 30), ...row('Chair', 5, 20, 20, 36, 8, 32, 2), ...row('Chair', 5, 20, 20, 36, 8, 32, 74), p('Chair', 2, 38, 20, 20, 36), p('Chair', 170, 38, 20, 20, 36)] },
  // Office and dispatch.
  'reception-desk': { name: 'Reception desk', w: 120, d: 66, h: 42, category: 'table', place: 'wall', parts: [p('Desk', 0, 0, 120, 30, 42), p('Chair', 24, 40, 24, 24, 36), p('Chair', 72, 40, 24, 24, 36)] },
  'dispatch-row-4': { name: 'Four dispatch consoles', w: 312, d: 66, h: 30, category: 'equipment', place: 'wall', seats: 4, kw: 3.2, parts: [...row('Console', 4, 72, 36, 30, 8, 0, 0), ...row('Chair', 4, 24, 24, 36, 56, 24, 42)] },
  'display-wall': { name: 'Display wall and screens', w: 240, d: 12, h: 96, category: 'fixture', place: 'wall', front: 48, kw: 2, shortWall: true },
  'class-seating-50': { name: 'Training tables, 5 rows of 10', w: 432, d: 312, h: 30, category: 'table', place: 'center', around: 24, seats: 50,
    parts: [0, 66, 132, 198, 264].flatMap(y => [...row('Table', 5, 72, 24, 30, 18, 0, y), ...row('Chair', 10, 20, 20, 36, 25.5, 6, y + 26)]) },
  'class-seating-30': { name: 'Training tables, 5 rows of 6', w: 204, d: 312, h: 30, category: 'table', place: 'center', around: 24, seats: 30,
    parts: [0, 66, 132, 198, 264].flatMap(y => [...row('Table', 3, 60, 24, 30, 12, 0, y), ...row('Chair', 6, 20, 20, 36, 16.8, 5, y + 26)]) },
  'walk-in-cooler': { name: 'Walk-in cooler and freezer', w: 96, d: 120, h: 96, category: 'kitchen', place: 'wall', front: 42, kw: 4 },
  'prep-table': { name: 'Stainless prep table', w: 96, d: 30, h: 36, category: 'kitchen', place: 'center', around: 36 },
  'eoc-seating-40': { name: 'Operations tables, 4 rows of 10', w: 432, d: 246, h: 30, category: 'table', place: 'center', around: 24, seats: 40, kw: 2,
    parts: [0, 66, 132, 198].flatMap(y => [...row('Table', 5, 72, 24, 30, 18, 0, y), ...row('Chair', 10, 20, 20, 36, 25.5, 6, y + 26)]) },
  'conference-16': { name: 'Conference table for 16', w: 264, d: 108, h: 30, category: 'table', place: 'center', around: 30, seats: 16,
    parts: [p('Table', 24, 24, 216, 60, 30), ...row('Chair', 7, 20, 20, 36, 10, 30, 2), ...row('Chair', 7, 20, 20, 36, 10, 30, 86), p('Chair', 2, 44, 20, 20, 36), p('Chair', 242, 44, 20, 20, 36)] },
  'conference-8': { name: 'Conference table for 8', w: 144, d: 90, h: 30, category: 'table', place: 'center', around: 24, seats: 8,
    parts: [p('Table', 24, 24, 96, 42, 30), ...row('Chair', 3, 20, 20, 36, 8, 34, 2), ...row('Chair', 3, 20, 20, 36, 8, 34, 68), p('Chair', 2, 35, 20, 20, 36), p('Chair', 122, 35, 20, 20, 36)] },
  'workstation-pod-4': { name: 'Four workstations', w: 120, d: 120, h: 30, category: 'table', place: 'floor', around: 24, seats: 4, kw: 0.8,
    parts: [p('Desk', 0, 30, 60, 30, 30), p('Desk', 60, 30, 60, 30, 30), p('Desk', 0, 60, 60, 30, 30), p('Desk', 60, 60, 60, 30, 30), p('Chair', 18, 2, 24, 24, 36), p('Chair', 78, 2, 24, 24, 36), p('Chair', 18, 94, 24, 24, 36), p('Chair', 78, 94, 24, 24, 36)] },
  'exec-desk': { name: 'Executive desk and chair', w: 84, d: 74, h: 30, category: 'table', place: 'wall', parts: [p('Desk', 0, 0, 84, 42, 30), p('Chair', 29, 48, 26, 26, 40)] },
  kitchenette: { name: 'Kitchenette', w: 96, d: 26, h: 36, category: 'kitchen', place: 'wall', front: 36, kw: 2 },
  'server-rack': { name: 'Server and radio racks', w: 96, d: 42, h: 84, category: 'equipment', place: 'wall', front: 42, kw: 8 },
  'plan-table': { name: 'Map and plan table', w: 96, d: 48, h: 36, category: 'table', place: 'center', around: 36 },
  'flat-files': { name: 'Flat files', w: 60, d: 36, h: 36, category: 'storage', place: 'wall', front: 36 },
  copier: { name: 'Copier and printer', w: 60, d: 30, h: 48, category: 'equipment', place: 'wall', front: 36, kw: 1.5 },
  // Car collection.
  'sports-car': { name: 'Sports car', w: 78, d: 180, h: 48, category: 'vehicle', place: 'floor', around: 24 },
  'classic-car': { name: 'Classic car', w: 80, d: 216, h: 54, category: 'vehicle', place: 'floor', around: 24 },
  suv: { name: 'Truck or SUV', w: 80, d: 240, h: 78, category: 'vehicle', place: 'floor', around: 24 },
  motorcycle: { name: 'Motorcycle', w: 34, d: 86, h: 46, category: 'vehicle', place: 'floor', around: 12 },
  snowmobile: { name: 'Snowmobile', w: 48, d: 132, h: 48, category: 'vehicle', place: 'floor', around: 12 },
  'car-lift': { name: 'Two-post lift bay', w: 144, d: 300, h: 4, category: 'equipment', place: 'floor', around: 18, kw: 3 },
  'alignment-rack': { name: 'Alignment rack', w: 144, d: 300, h: 24, category: 'equipment', place: 'floor', around: 24, kw: 2 },
  'tire-machine': { name: 'Tire changer and balancer', w: 72, d: 36, h: 48, category: 'equipment', place: 'wall', front: 36, kw: 2 },
  'paint-booth': { name: 'Downdraft paint booth', w: 192, d: 336, h: 120, category: 'fixture', place: 'center', around: 18, kw: 15 },
  'mixing-bench': { name: 'Paint mixing bench', w: 96, d: 30, h: 36, category: 'equipment', place: 'wall', front: 36, kw: 1 },
  'car-wash': { name: 'Car wash bay with pressure washer', w: 144, d: 300, h: 4, category: 'equipment', place: 'center', kw: 5 },
  'detail-station': { name: 'Detail bay', w: 144, d: 300, h: 4, category: 'equipment', place: 'center', kw: 2 },
  // Entertainment.
  'kart-circuit': { name: 'Indoor kart circuit', w: 2640, d: 1440, h: 3, category: 'fixture', place: 'center' },
  'go-kart': { name: 'Electric go-kart', w: 48, d: 80, h: 30, category: 'vehicle', place: 'floor', around: 12, kw: 3 },
  'trampoline-court': { name: 'Trampoline court', w: 600, d: 480, h: 36, category: 'fixture', place: 'floor' },
  'foam-pit': { name: 'Foam pit', w: 240, d: 240, h: 36, category: 'fixture', place: 'floor' },
  'dodgeball-court': { name: 'Trampoline dodgeball court', w: 360, d: 240, h: 36, category: 'fixture', place: 'floor' },
  'ninja-course': { name: 'Ninja course', w: 480, d: 96, h: 120, category: 'fixture', place: 'wall' },
  'climbing-wall': { name: 'Climbing wall', w: 480, d: 36, h: 360, category: 'fixture', place: 'wall', front: 120 },
  'arena-obstacles': { name: 'Laser tag arena walls', w: 600, d: 600, h: 72, category: 'fixture', place: 'center' },
  'basketball-court': { name: 'Basketball and pickleball court', w: 600, d: 1008, h: 1, category: 'fixture', place: 'center' },
  'bowling-lanes-4': { name: 'Four bowling lanes', w: 288, d: 1080, h: 1, category: 'fixture', place: 'center', kw: 8, parts: row('Lane', 4, 60, 1080, 1, 12, 0, 0) },
  'arcade-row': { name: 'Six arcade cabinets', w: 216, d: 36, h: 72, category: 'equipment', place: 'wall', front: 48, kw: 3 },
  'pinball-row': { name: 'Three pinball machines', w: 150, d: 54, h: 72, category: 'equipment', place: 'wall', front: 42, kw: 1.2 },
  'skee-ball-row': { name: 'Four skee-ball lanes', w: 120, d: 120, h: 60, category: 'equipment', place: 'wall', front: 48, kw: 1 },
  'air-hockey': { name: 'Air hockey table', w: 96, d: 54, h: 32, category: 'equipment', place: 'center', around: 36, kw: 0.5 },
  'golf-sim-bay': { name: 'Golf simulator bay', w: 180, d: 240, h: 120, category: 'equipment', place: 'floor', kw: 1.5 },
  // Mechanical and storage rooms.
  boiler: { name: 'Boiler', w: 36, d: 36, h: 72, category: 'equipment', place: 'wall', front: 36, kw: 1 },
  'water-heater': { name: 'Water heaters', w: 60, d: 30, h: 72, category: 'equipment', place: 'wall', front: 30, kw: 4.5 },
  'electrical-panels': { name: 'Electrical panels', w: 72, d: 12, h: 72, category: 'equipment', place: 'wall', front: 42 },
  'pool-filter': { name: 'Pool pumps and filters', w: 72, d: 36, h: 48, category: 'equipment', place: 'wall', front: 36, kw: 3.7 },
  // Fireplaces and built-ins, per the brief: floor-to-ceiling stone in the great room, stone in the primary suite and outdoors.
  'fireplace-stone-tall': { name: 'Stone fireplace, floor to ceiling', w: 120, d: 36, h: 216, category: 'fixture', place: 'wall', front: 48, material: 'stone',
    parts: [p('Hearth', 0, 18, 120, 18, 16), p('Stone chimney breast', 12, 0, 96, 18, 216)] },
  'fireplace-stone': { name: 'Stone fireplace', w: 84, d: 30, h: 108, category: 'fixture', place: 'wall', front: 42, material: 'stone',
    parts: [p('Hearth', 0, 14, 84, 16, 16), p('Stone surround', 6, 0, 72, 14, 108)] },
  'fireplace-outdoor': { name: 'Outdoor stone fireplace', w: 96, d: 36, h: 132, category: 'outdoor', place: 'wall', front: 60, material: 'stone',
    parts: [p('Hearth', 0, 18, 96, 18, 18), p('Stone firebox and chimney', 8, 0, 80, 18, 132)] },
  'outdoor-kitchen': { name: 'Outdoor kitchen: grill, sink, fridge, counter', w: 144, d: 30, h: 36, category: 'outdoor', place: 'wall', front: 42, kw: 2, material: 'stone' },
  'built-in-shelves': { name: 'Built-in shelves and cabinets', w: 120, d: 16, h: 96, category: 'storage', place: 'wall', front: 30, material: 'timber' },
  'bunk-nook': { name: 'Built-in bunk nook, sleeps two, with reading lights', w: 84, d: 48, h: 84, category: 'bed', place: 'wall', front: 30, material: 'timber',
    parts: [p('Lower bunk', 2, 6, 80, 40, 18), p('Upper bunk', 2, 6, 80, 40, 60), p('Timber surround', 0, 0, 84, 6, 84)] },
  'reading-nook': { name: 'Reading nook with cushions and shelves', w: 60, d: 36, h: 84, category: 'seating', place: 'wall', front: 24, seats: 1, material: 'timber',
    parts: [p('Cushion', 0, 8, 60, 28, 18), p('Shelves', 0, 0, 60, 8, 84)] },
  'breakfast-banquette': { name: 'Breakfast banquette and table', w: 96, d: 72, h: 36, category: 'table', place: 'wall', front: 24, seats: 6, material: 'timber',
    parts: [p('Banquette', 0, 0, 96, 22, 36), p('Table', 12, 24, 72, 36, 30)] },
  'wine-wall': { name: 'Glass-fronted wine wall', w: 144, d: 24, h: 96, category: 'storage', place: 'wall', front: 36, kw: 1.5 },
  // Compound pieces: the commons dining hall, aircraft, and fuel.
  'dining-hall-160': { name: 'Dining hall tables, 10 tables of 16', w: 648, d: 526, h: 30, category: 'table', place: 'center', around: 36, seats: 160,
    parts: [0, 108, 216, 324, 432].flatMap(y => [0, 360].flatMap(x => [p('Table', x, y + 22, 288, 42, 30), ...row('Chair', 8, 20, 20, 36, 18.3, x + 2, y), ...row('Chair', 8, 20, 20, 36, 18.3, x + 2, y + 66)])) },
  helicopter: { name: 'Helicopter, light utility (Type 3)', w: 528, d: 120, h: 144, category: 'vehicle', place: 'floor', around: 72,
    parts: [p('Cabin', 0, 24, 168, 72, 132), p('Tail boom', 168, 48, 312, 24, 72), p('Tail fin', 480, 36, 48, 48, 144)] },
  airplane: { name: 'Twin turboprop airplane', w: 648, d: 528, h: 180, category: 'vehicle', place: 'center', around: 48,
    parts: [p('Wing', 0, 168, 648, 72, 72), p('Fuselage', 288, 0, 72, 528, 96), p('Tail', 216, 456, 216, 72, 180)] },
  'fuel-dispenser': { name: 'Fuel dispenser on an island', w: 96, d: 36, h: 72, category: 'equipment', place: 'center', around: 60 },
  'fuel-tank': { name: 'Aboveground fuel tank, 10,000 gal, double wall', w: 120, d: 360, h: 120, category: 'equipment', place: 'floor', around: 36 },
  'wine-rack': { name: 'Wine racks', w: 72, d: 16, h: 84, category: 'storage', place: 'wall', front: 30 },
}

export const catalogEntry = (kind: string) => CATALOG[kind]

/** The rectangle a placed piece covers, in house-local inches. */
export function footprint(item: Pick<FurnitureItem, 'kind' | 'x' | 'y' | 'rotation'>): Rect {
  const c = CATALOG[item.kind]
  const [w, d] = item.rotation % 180 === 0 ? [c.w, c.d] : [c.d, c.w]
  return { x: item.x - w / 2, y: item.y - d / 2, w, d }
}

/** The piece's parts as house-local rectangles, for drawing on plans and in 3D. */
export function parts(item: FurnitureItem): (Rect & { name: string; h: number })[] {
  const c = CATALOG[item.kind]
  const f = footprint(item)
  const list = c.parts ?? [p(c.name, 0, 0, c.w, c.d, c.h)]
  return list.map(q => {
    // Local (u, v) from the back-left corner seen from the front; rotate into the footprint.
    switch (item.rotation) {
      case 0: return { name: q.name, h: q.h, x: f.x + q.x, y: f.y + q.y, w: q.w, d: q.d }
      case 180: return { name: q.name, h: q.h, x: f.x + f.w - q.x - q.w, y: f.y + f.d - q.y - q.d, w: q.w, d: q.d }
      case 90: return { name: q.name, h: q.h, x: f.x + f.w - q.y - q.d, y: f.y + q.x, w: q.d, d: q.w }
      default: return { name: q.name, h: q.h, x: f.x + q.y, y: f.y + f.d - q.x - q.w, w: q.d, d: q.w }
    }
  })
}

/** Walking room a piece keeps clear: a band in front of it, or all around it. */
export function clearance(item: Pick<FurnitureItem, 'kind' | 'x' | 'y' | 'rotation'>): Rect[] {
  const c = CATALOG[item.kind]
  const f = footprint(item)
  const out: Rect[] = []
  if (c.around) out.push({ x: f.x - c.around, y: f.y - c.around, w: f.w + 2 * c.around, d: f.d + 2 * c.around })
  if (c.front) {
    const k = c.front
    out.push(item.rotation === 0 ? { x: f.x, y: f.y + f.d, w: f.w, d: k } : item.rotation === 180 ? { x: f.x, y: f.y - k, w: f.w, d: k }
      : item.rotation === 90 ? { x: f.x - k, y: f.y, w: k, d: f.d } : { x: f.x + f.w, y: f.y, w: k, d: f.d })
  }
  return out
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.d - 0.5 && b.y < a.y + a.d - 0.5
const within = (a: Rect, b: Rect) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.d <= b.y + b.d + 0.5
const inset = (r: Rect, by: number): Rect => ({ x: r.x + by, y: r.y + by, w: r.w - 2 * by, d: r.d - 2 * by })
const clip = (a: Rect, b: Rect): Rect | null => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.d, b.y + b.d)
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, d: y1 - y0 } : null
}

/** Space inside a room kept clear for each door, cased opening, and garage door, so pieces do not block them. */
export function doorZones(house: HouseModel, room: Room, placed = placeOpenings(house)): Rect[] {
  const r = room.rect
  return placed.filter(o => !o.problem && o.kind !== 'window' && o.kind !== 'garage-door' && (o.roomId === room.id || o.leadsTo === room.id)).flatMap(o => {
    // A door swings its leaf width into the room; a pair of doors wider than 4 ft swings two half-width leaves.
    const depth = o.kind === 'opening' ? 30 : Math.max(36, o.width > 48 ? o.width / 2 : o.width)
    const z = o.orientation === 'h'
      ? (Math.abs(o.at - r.y) < 1 ? { x: o.from, y: r.y, w: o.to - o.from, d: depth } : Math.abs(o.at - (r.y + r.d)) < 1 ? { x: o.from, y: r.y + r.d - depth, w: o.to - o.from, d: depth } : null)
      : (Math.abs(o.at - r.x) < 1 ? { x: r.x, y: o.from, w: depth, d: o.to - o.from } : Math.abs(o.at - (r.x + r.w)) < 1 ? { x: r.x + r.w - depth, y: o.from, w: depth, d: o.to - o.from } : null)
    const c = z && clip(z, r)
    return c ? [c] : []
  })
}

/** What goes in a room, by its id, then by its name, then by its type. */
function recipe(room: Room): string[] {
  const id = room.id.replace(/^g-/, ''), name = room.name.toLowerCase()
  const area = room.rect.w * room.rect.d / 144
  const byId: Record<string, string[]> = {
    great: ['fireplace-stone-tall', 'sectional-group', 'living-group', 'piano'],
    kitchen: ['counter-range', 'counter-sink', 'fridge', 'pantry-wall', 'island-table'],
    dining: ['dining-12', 'console-table'],
    office: ['desk', 'built-in-shelves', 'armchair'],
    den: ['living-group', 'window-seat'],
    hearth: ['fireplace-stone', 'armchair-pair'],
    bar: ['bar-counter', 'wine-wall'],
    'game-room': ['game-table-4', 'armchair-pair'],
    terrace: ['outdoor-kitchen', 'fireplace-outdoor', 'dining-8'],
    lounge: ['bar-counter', 'armchair-pair'],
    foyer: ['console-table', 'bench'],
    mudroom: ['cubbies', 'dog-wash', 'bench', 'laundry-pair', 'folding-counter'],
    laundry: ['laundry-pair', 'folding-counter'],
    pantry: ['pantry-shelves', 'pantry-shelves', 'fridge'],
    scullery: ['counter-sink', 'counter-range', 'fridge'],
    garage: ['car', 'car', 'car', 'workbench'],
    primary: ['king-bed-set', 'fireplace-stone', 'bench'],
    'primary-sitting': ['living-group', 'tv-console'],
    'guest-sitting': ['living-group', 'tv-console'],
    'kids-living': ['living-group', 'game-table-4', 'tv-console'],
    homework: ['long-desk', 'bookshelf'],
    'w-lounge': ['living-group', 'bar-counter'],
    theater: ['theater-screen', 'theater-seating-20'],
    'theater-lobby': ['candy-wall', 'popcorn-cart', 'bench'],
    gym: ['power-rack', 'treadmill', 'treadmill', 'rower', 'bike', 'reformer', 'dumbbell-rack', 'mat-area'],
    woodshop: ['table-saw', 'workbench', 'lumber-rack', 'dust-collector', 'jointer', 'planer', 'bandsaw', 'drill-press'],
    craft: ['craft-table', 'sewing-table', 'printer-bench', 'shelving'],
    mech: ['boiler', 'water-heater', 'electrical-panels'],
    'pool-equip': ['pool-filter', 'shelving'],
    'indoor-pool': ['pool-basin', 'lounge-chairs', 'lounge-chairs'],
    'pool-deck': ['hot-tub', 'cold-plunge'],
    'spa-lounge': ['lounge-chairs', 'armchair-pair', 'shower'],
    steam: ['spa-bench'], sauna: ['spa-bench'],
    massage: ['massage-table'], 'hair-nail': ['salon-station'],
    locker: ['lockers', 'shower', 'bench'],
    'wine-cellar': ['wine-rack'], 'safe-room': ['spa-bench', 'shelving'],
    bunk: ['bunk-bed', 'bunk-bed', 'bunk-bed'],
  }
  // Utility rooms, closets, gear rooms, and restrooms.
  if (/mechanical/.test(name)) return ['electrical-panels', 'water-heater', 'boiler']
  if (/pool equipment/.test(name)) return ['pool-filter', 'shelving']
  if (/dish room/.test(name)) return ['counter-sink', 'prep-table', 'shelving']
  if (/coat/.test(name)) return ['closet-rods-short']
  if (/gear room/.test(name)) return ['gear-lockers', 'gear-lockers', 'bench', 'shelving']
  if (/changing room/.test(name)) return ['toilet', 'vanity-single', 'shower', 'bench']
  if (/restrooms and showers|showers and lockers|fitness restrooms/.test(name)) return ['toilet-stalls-3', 'lav-counter-3', 'shower', 'bench']
  if (/^restroom$/.test(name)) return ['toilet', 'vanity-single']
  if (/^restrooms$/.test(name)) return ['toilet-stalls-3', 'lav-counter-3']
  // Compound lodging, commons, classroom, hangars, pool house, and fuel island.
  if (/couple's room/.test(name)) return ['queen-bed-set', 'desk']
  if (/private room/.test(name)) return ['twin-bed', 'desk', 'small-dresser']
  if (/lodge lounge/.test(name)) return ['living-group', 'game-table-4']
  if (/dining hall/.test(name)) return ['dining-hall-160']
  if (/camp store/.test(name)) return ['reception-desk', 'shelving', 'shelving', 'shelving']
  if (/laundry room/.test(name)) return ['laundry-pair', 'laundry-pair', 'laundry-pair', 'laundry-pair', 'folding-counter']
  if (/lounge and game/.test(name)) return ['sectional-group', 'living-group', 'game-table-4', 'game-table-4', 'tv-console']
  if (/^classroom/.test(name)) return ['display-wall', 'class-seating-30']
  if (/forestry lab/.test(name)) return ['prep-table', 'prep-table', 'plan-table', 'shelving', 'shelving']
  if (/instructor office/.test(name)) return ['desk', 'bookshelf']
  if (/helicopter hangar/.test(name)) return Array(6).fill('helicopter')
  if (/airplane hangar/.test(name)) return ['airplane']
  if (/pilot ready room/.test(name)) return ['living-group', 'long-desk']
  if (/crew quarters/.test(name)) return ['bunk-bed', 'bunk-bed', 'small-dresser']
  if (/aircraft maintenance/.test(name)) return ['workbench', 'parts-racks', 'welding-bench']
  if (/aviation parts/.test(name)) return ['parts-racks', 'parts-racks']
  if (/^cabin \d+ living/.test(name)) return ['living-group', 'counter-sink', 'kitchen-table-6']
  if (/^cabin \d+ bedroom/.test(name)) return ['queen-bed-set']
  if (/^cabin \d+ bunk/.test(name)) return ['bunk-bed']
  if (/pool bar/.test(name)) return ['bar-counter', 'armchair-pair']
  if (/outdoor pool deck/.test(name)) return ['pool-basin', 'lounge-chairs', 'lounge-chairs', 'lounge-chairs']
  if (/loggia/.test(name)) return ['outdoor-kitchen', 'fireplace-outdoor', 'dining-8']
  if (/fuel canopy/.test(name)) return Array(4).fill('fuel-dispenser')
  if (/tank farm/.test(name)) return Array(3).fill('fuel-tank')
  if (/lubricant/.test(name)) return ['shelving', 'shelving', 'parts-racks']
  // Kids' rooms: a twin bed and desk, plus the built-in nook the name asks for.
  // A bunk nook takes the bed's place and a reading nook the desk's; the homework room has desks for everyone.
  if (/^kid bedroom/.test(name)) return [/bunk nook/.test(name) ? 'bunk-nook' : 'twin-bed', /reading nook/.test(name) ? 'reading-nook' : 'desk']
  if (/reception/.test(name)) return ['reception-desk', 'living-group']
  if (/arrival lobby/.test(name)) return ['console-table', 'bench', 'bench']
  if (/dispatch floor/.test(name)) return ['dispatch-row-4', 'dispatch-row-4', 'display-wall']
  if (/emergency operations/.test(name)) return ['display-wall', 'eoc-seating-40']
  if (/training room [ab]/.test(name)) return ['display-wall', 'class-seating-30']
  if (/training room/.test(name)) return ['display-wall', 'class-seating-50']
  if (/commercial kitchen/.test(name)) return ['walk-in-cooler', 'counter-range', 'counter-range', 'counter-sink', 'fridge', 'prep-table']
  if (/executive conference/.test(name)) return ['conference-8']
  if (/executive office/.test(name)) return ['exec-desk', 'bookshelf', 'bookshelf', 'armchair-pair']
  if (/executive lounge/.test(name)) return ['living-group', 'bar-counter']
  if (/anteroom/.test(name)) return ['desk', 'armchair-pair']
  if (/conference room/.test(name)) return ['conference-16', 'display-wall']
  if (/open office/.test(name)) return Array(6).fill('workstation-pod-4')
  if (/private office/.test(name)) return ['desk', 'bookshelf', 'armchair']
  if (/break room/.test(name)) return ['counter-sink', 'fridge', 'game-table-4', 'game-table-4', 'game-table-4']
  if (/dispatcher rest/.test(name)) return ['sofa', 'kitchenette', 'armchair']
  if (/radio and server/.test(name)) return ['server-rack', 'electrical-panels']
  if (/records and plans/.test(name)) return ['plan-table', 'flat-files', 'shelving', 'shelving']
  if (/mail, print/.test(name)) return ['copier', 'folding-counter', 'shelving', 'shelving']
  if (/showers and lockers/.test(name)) return ['lockers', 'lockers', 'shower', 'shower', 'bench']
  if (/collector's lounge/.test(name)) return ['bar-counter', 'living-group', 'living-group', 'dining-12', 'armchair-pair']
  if (/catering/.test(name)) return ['counter-range', 'counter-sink', 'fridge', 'kitchenette']
  if (/detail bay/.test(name)) return ['detail-station', 'shelving']
  if (/wash bay/.test(name)) return ['car-wash', 'shelving']
  if (/paint booth/.test(name)) return ['paint-booth']
  if (/paint mixing/.test(name)) return ['mixing-bench', 'shelving']
  if (/body and prep/.test(name)) return ['car-lift', 'workbench']
  if (/mechanic area/.test(name)) return ['workbench', 'parts-racks']
  if (/^restrooms$|mezzanine restrooms/i.test(name)) return ['toilet', 'toilet', 'vanity-double']
  if (/tire and alignment/.test(name)) return ['alignment-rack', 'tire-machine']
  if (/indoor kart track/.test(name)) return ['kart-circuit']
  if (/kart pit/.test(name)) return [...Array(8).fill('go-kart'), 'workbench']
  if (/trampoline park/.test(name)) return ['trampoline-court', 'dodgeball-court', 'foam-pit', 'ninja-course']
  if (/climbing/.test(name)) return ['climbing-wall', 'mat-area']
  if (/laser tag/.test(name)) return ['arena-obstacles']
  if (/sports court/.test(name)) return ['basketball-court']
  if (/bowling/.test(name)) return ['bowling-lanes-4', 'living-group']
  if (/arcade/.test(name)) return ['arcade-row', 'arcade-row', 'pinball-row', 'skee-ball-row', 'air-hockey']
  if (/golf/.test(name)) return ['golf-sim-bay', 'golf-sim-bay']
  if (/gaming lounge/.test(name)) return ['living-group', 'tv-console', 'living-group']
  if (/snack bar/.test(name)) return ['counter-sink', 'fridge', 'bar-counter', 'game-table-4', 'game-table-4']
  if (/party room/.test(name)) return ['dining-12', 'dining-12']
  if (/viewing mezzanine/.test(name)) return ['living-group', 'living-group', 'living-group', 'bar-counter']
  if (/gear lockers/.test(name)) return ['gear-lockers', 'gear-lockers', 'gear-lockers', 'bench']
  if (/hose/.test(name)) return ['hose-washer', 'shelving']
  if (/ready room/.test(name)) return ['conference-table', 'living-group', 'tv-console']
  if (/fitness/.test(name)) return ['power-rack', 'treadmill', 'treadmill', 'rower', 'bike', 'dumbbell-rack']
  if (/parts/.test(name)) return ['parts-racks', 'parts-racks', 'parts-racks', 'parts-racks']
  if (/welding|fabrication/.test(name)) return ['welding-bench', 'workbench']
  if (/shop office|offices/.test(name)) return ['desk', 'desk', 'desk', 'bookshelf']
  if (/decon|locker room|restroom/.test(name)) return ['shower', 'shower', 'vanity-double', 'toilet', 'toilet', 'lockers']
  if (byId[id]) return byId[id]
  if (room.type === 'bedroom') return area >= 280 ? ['queen-bed-set', 'dresser'] : ['twin-bed', 'desk', 'small-dresser']
  if (room.type === 'bath') {
    if (/powder/.test(name)) return ['toilet', 'vanity-single']
    // Small baths get a compact three-piece set that fits along one wall.
    if (area < 75) return ['bath-set-compact']
    if (area >= 180) return ['tub', 'shower', 'vanity-double', 'toilet']
    return area >= 110 ? ['shower', 'vanity-single', 'toilet'] : ['shower-small', 'vanity-single', 'toilet']
  }
  if (/closet/.test(name) && !/coat/.test(name)) return area < 90 ? ['closet-rods-short', 'closet-rods-short'] : ['closet-rods', 'closet-rods']
  if (/vanity/.test(name)) return ['vanity-double', 'bench']
  if (/storage|linen/.test(name)) return ['shelving', 'shelving']
  if (/terrace/.test(name)) return ['dining-8', 'living-group']
  if (/porch/.test(name)) return ['armchair-pair', 'armchair-pair']
  if (/deck/.test(name)) return ['lounge-chairs']
  if (room.type === 'living') return area >= 300 ? ['living-group'] : ['armchair-pair']
  return []
}

/**
 * The first pass: furnishes a room from its recipe. Wall pieces go back to a wall, preferring long walls without
 * doors and the middle of the wall; center pieces go near the middle; floor pieces hug the walls. Every piece stays
 * inside the room, off the other pieces and their walking room, and out of the space doors need. A piece with no
 * place that fits is left out.
 */
export function furnishRoom(house: HouseModel, room: Room, startId = 1): FurnitureItem[] {
  if (room.type === 'circulation' && !/lobby|foyer/i.test(room.name)) return []
  const inner = inset(room.rect, 3)
  const doors = room.type === 'outdoor' ? [] : doorZones(house, room)
  const placed: FurnitureItem[] = []
  const blocked = () => [...doors, ...placed.map(footprint), ...placed.flatMap(clearance)]
  let n = startId
  for (const kind of recipe(room)) {
    const c = CATALOG[kind]
    if (!c) continue
    const candidates: { item: FurnitureItem; score: number }[] = []
    const add = (x: number, y: number, rotation: FurnitureItem['rotation'], score: number) =>
      candidates.push({ item: { id: `f-${room.id}-${n}`, kind, roomId: room.id, x, y, rotation }, score })
    const step = Math.max(6, Math.round(Math.min(inner.w, inner.d) / 40 / 6) * 6)
    if (c.place === 'wall') {
      const sides = [
        { rotation: 0 as const, len: inner.w, at: (t: number, w: number, d: number) => [inner.x + t + w / 2, inner.y + d / 2], dims: [c.w, c.d] },
        { rotation: 180 as const, len: inner.w, at: (t: number, w: number, d: number) => [inner.x + t + w / 2, inner.y + inner.d - d / 2], dims: [c.w, c.d] },
        { rotation: 90 as const, len: inner.d, at: (t: number, w: number, d: number) => [inner.x + inner.w - w / 2, inner.y + t + d / 2], dims: [c.d, c.w] },
        { rotation: 270 as const, len: inner.d, at: (t: number, w: number, d: number) => [inner.x + w / 2, inner.y + t + d / 2], dims: [c.d, c.w] },
      ]
      for (const s of sides) {
        const [w, d] = s.dims, along = s.rotation % 180 === 0 ? w : d
        for (let t = 0; t + along <= s.len + 0.1; t += step) {
          const [x, y] = s.at(t, w, d)
          add(x, y, s.rotation, Math.abs(t + along / 2 - s.len / 2) / 12 + (c.shortWall ? s.len : -s.len) / 24)
        }
      }
    } else {
      const rotations: FurnitureItem['rotation'][] = c.place === 'center' ? [0, 90] : [0, 90, 180, 270]
      for (const rotation of rotations) {
        const [w, d] = rotation % 180 === 0 ? [c.w, c.d] : [c.d, c.w]
        for (let x = inner.x + w / 2; x <= inner.x + inner.w - w / 2 + 0.1; x += step) for (let y = inner.y + d / 2; y <= inner.y + inner.d - d / 2 + 0.1; y += step) {
          const toWall = Math.min(x - w / 2 - inner.x, inner.x + inner.w - x - w / 2, y - d / 2 - inner.y, inner.y + inner.d - y - d / 2)
          const toCenter = Math.hypot(x - (inner.x + inner.w / 2), y - (inner.y + inner.d / 2))
          add(x, y, rotation, c.place === 'center' ? toCenter / 12 : toWall / 12 + toCenter / 1200)
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score)
    const block = blocked()
    // Ignore any piece too big for the room before searching.
    const fit = candidates.find(({ item }) => {
      const f = footprint(item)
      if (!within(f, inner) || block.some(b => overlap(f, b))) return false
      return clearance(item).every(z => (c.around ? true : within(z, inner)) && !placed.some(q => overlap(z, footprint(q))))
    })
    if (fit) { placed.push(fit.item); n++ }
  }
  return placed
}

/** Furnishes every room of a house. */
export function firstPassFurniture(house: HouseModel): FurnitureItem[] {
  return house.levels.flatMap(l => l.rooms.flatMap(r => furnishRoom(house, r)))
}

/** Checks for one house: pieces fit their rooms and each other, keep their walking room, leave doors clear, and seat the program. */
export function furnitureChecks(e: Estate): Check[] {
  const house = e.house
  const items = house.furniture ?? []
  const placed = placeOpenings(house)
  const room = (id: string) => house.levels.flatMap(l => l.rooms).find(r => r.id === id)
  const levelOf = (id: string) => house.levels.find(l => l.rooms.some(r => r.id === id))?.id
  const name = (i: FurnitureItem) => `${CATALOG[i.kind]?.name ?? i.kind} in ${room(i.roomId)?.name ?? i.roomId}`
  const bad: { text: string; ids: string[] }[] = []
  for (const i of items) {
    const r = room(i.roomId)
    if (!CATALOG[i.kind]) { bad.push({ text: `${i.id} is an unknown piece (${i.kind})`, ids: [i.id] }); continue }
    if (!r) { bad.push({ text: `${i.id} is in a room that no longer exists`, ids: [i.id] }); continue }
    if (!within(footprint(i), inset(r.rect, 2))) bad.push({ text: `${name(i)} runs into a wall`, ids: [i.id, r.id] })
  }
  const known = items.filter(i => CATALOG[i.kind] && room(i.roomId))
  known.forEach((a, k) => known.slice(k + 1).forEach(b => {
    if (levelOf(a.roomId) === levelOf(b.roomId) && overlap(footprint(a), footprint(b))) bad.push({ text: `${name(a)} overlaps ${CATALOG[b.kind].name}`, ids: [a.id, b.id] })
  }))
  const tight: { text: string; ids: string[] }[] = []
  for (const a of known) {
    const r = room(a.roomId)!
    for (const z of clearance(a)) {
      // Walking room counts within the room; the wall beside it already keeps the next room's pieces away.
      const hit = known.find(b => b !== a && b.roomId === a.roomId && overlap(z, footprint(b)))
      if (hit) { tight.push({ text: `${name(a)} has ${CATALOG[hit.kind].name.toLowerCase()} in its walking room`, ids: [a.id, hit.id] }); break }
    }
    if (r.type !== 'outdoor') for (const z of doorZones(house, r, placed)) if (overlap(z, footprint(a))) { tight.push({ text: `${name(a)} blocks a door`, ids: [a.id] }); break }
  }
  const seats: { text: string; ids: string[] }[] = []
  for (const need of house.program ?? []) {
    if (!need.seats) continue
    const have = known.filter(i => i.roomId === need.roomId).reduce((s, i) => s + (CATALOG[i.kind].seats ?? 0), 0)
    if (have < need.seats) seats.push({ text: `${room(need.roomId)?.name ?? need.roomId} seats ${have} of ${need.seats}`, ids: [need.roomId] })
  }
  const fleet: { text: string; ids: string[] }[] = []
  const fleetOk: string[] = []
  for (const need of house.program ?? []) {
    for (const [kind, count] of Object.entries(need.holds ?? {})) {
      const have = known.filter(i => i.roomId === need.roomId && i.kind === kind).length
      if (have < count) fleet.push({ text: `${room(need.roomId)?.name ?? need.roomId} holds ${have} of ${count} ${CATALOG[kind]?.name.toLowerCase() ?? kind}s`, ids: [need.roomId] })
      else fleetOk.push(`${have} ${CATALOG[kind]?.name.toLowerCase() ?? kind}s`)
    }
  }
  const BASIS = 'Real-size pieces with common walking-room allowances; a planning check, not a code review'
  const list = (b: { text: string }[]) => `${b.slice(0, 4).map(x => x.text).join('; ')}${b.length > 4 ? `; and ${b.length - 4} more` : ''}. ${BASIS}.`
  const make = (id: string, label: string, b: typeof bad, ok: string): Check =>
    b.length ? { id, label, status: 'warn', detail: list(b), elements: [...new Set(b.flatMap(x => x.ids))] } : { id, label, status: 'pass', detail: `${ok}. ${BASIS}.` }
  const kw = known.reduce((s, i) => s + (CATALOG[i.kind].kw ?? 0), 0)
  return [
    make('furniture-fit', 'Furniture fits its rooms without overlapping', bad, `${known.length} pieces placed, ${Math.round(kw * 10) / 10} kW of appliances and machines`),
    make('furniture-clearance', 'Furniture keeps its walking room and leaves doors clear', tight, 'Every piece has its walking room'),
    ...(fleetOk.length || fleet.length ? [make('fleet', 'Shops hold their fleets indoors', fleet, fleetOk.join(', '))] : []),
    make('seating', 'Rooms seat the people the brief asks for', seats, (house.program ?? []).filter(p => p.seats).map(p => `${room(p.roomId)?.name ?? p.roomId} seats ${p.seats}`).join('; ') || 'No seat counts in the brief'),
  ]
}

/** One line per room for the chat summary. */
export function furnitureLine(house: HouseModel, room: Room) {
  const items = (house.furniture ?? []).filter(i => i.roomId === room.id)
  if (items.length > 12) {
    const counts = new Map<string, number>()
    for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1)
    return `    furniture: ${[...counts].map(([k, c]) => `${c} ${k}`).join(', ')} (ids ${items[0].id} to ${items[items.length - 1].id})`
  }
  return items.length ? `    furniture: ${items.map(i => `${i.id} ${i.kind} at ${Math.round(toFt(i.x) * 10) / 10},${Math.round(toFt(i.y) * 10) / 10} rot ${i.rotation}`).join('; ')}` : ''
}
