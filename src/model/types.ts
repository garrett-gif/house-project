/** All stored lengths are inches. Site coordinates: x east, y north, origin at the southwest parcel corner. */
export type Inches = number
export interface Pt { x: Inches; y: Inches }
export interface Rect { x: Inches; y: Inches; w: Inches; d: Inches }

export type Access = 'private' | 'work' | 'visitor' | 'shared'
export type BuildingUse = 'residence' | 'accessory' | 'business' | 'lodging' | 'assembly' | 'aviation'
export type ZoneKind = 'estate' | 'operations' | 'lodging' | 'training' | 'aviation' | 'incident' | 'recreation' | 'water' | 'fuelbreak'
export type RoadKind = 'estate' | 'work' | 'perimeter' | 'gated-link'

export interface Parcel { seed: number; size: Inches; gridSize: number }

export interface Building {
  id: string
  name: string
  use: BuildingUse
  access: Access
  rect: Rect
  height: Inches
  /** Actual masses above grade when the building is not a plain rectangle. `rect` remains the overall bounds. */
  parts?: Rect[]
  /** Footprint on every level, including rooms below grade. Collisions use this. Absent means the same as `parts`. */
  footprint?: Rect[]
}

export interface Zone {
  id: string
  name: string
  kind: ZoneKind
  access: Access
  rect: Rect
  /** Cleared or developed land. Thinned forest and training ground stay false. */
  cleared: boolean
  round?: boolean
}

export interface Road { id: string; name: string; kind: RoadKind; points: Pt[]; gate?: string }
/** `from` and `to` are building ids. Moving one of those buildings moves that end of the walkway with it. */
export interface Walkway { id: string; name: string; points: Pt[]; from?: string; to?: string }

export type RoomType = 'bedroom' | 'bath' | 'living' | 'service' | 'circulation' | 'wellness' | 'garage' | 'pool' | 'outdoor'
/** `twoStory` rooms are open to the floor above, so their walls rise through it to the roof. */
export interface Room { id: string; name: string; type: RoomType; rect: Rect; bathId?: string; twoStory?: boolean }
/** A side of a rectangle: north, south, east, or west. */
export type Side = 'n' | 's' | 'e' | 'w'

/**
 * `exposed` applies to levels below grade (elevation under 0): exterior walls facing these sides are above grade
 * and framed, as on a walkout. All other exterior walls on that level are foundation walls.
 */
export interface Level { id: string; name: string; floorHeight: Inches; elevation: Inches; rooms: Room[]; exposed?: Side[] }

export type WallKind = 'exterior' | 'interior' | 'foundation'
/** Default wall thickness by kind. Walls are derived from room edges, which are wall centerlines. */
export type WallThickness = Record<WallKind, Inches>

export type OpeningKind = 'door' | 'window' | 'opening' | 'garage-door'
export type WindowOperation = 'casement' | 'double-hung' | 'slider' | 'fixed'

/**
 * A door, window, or cased opening in a wall. It is hosted on one side of a room, and `offset` is the distance from
 * that side's start (its west end for north and south sides, its south end for east and west sides) to the center
 * of the opening. What lies on the other side is worked out from the rooms.
 */
export interface Opening {
  id: string
  kind: OpeningKind
  roomId: string
  side: Side
  offset: Inches
  width: Inches
  height: Inches
  /** Height of the bottom of the opening above the floor. 0 for doors. */
  sill: Inches
  operation?: WindowOperation
  /** Doors: swings into the host room, or out of it. */
  swing?: 'in' | 'out'
}

export type RoofForm = 'gable' | 'hip' | 'shed'

/**
 * A roof over part of the house. `rect` is the area it covers to wall centerlines, in house-local inches, before
 * overhang. The eave sits on top of the walls of `levelId`. Gable and hip roofs run their ridge east-west ('ew') or
 * north-south ('ns'); a shed roof slopes down toward its `low` side. Pitch is rise in inches per 12 of run.
 */
export interface Roof {
  id: string
  name: string
  rect: Rect
  levelId: string
  form: RoofForm
  pitch: number
  ridge: 'ew' | 'ns'
  low: Side
  overhang: Inches
}

/** A stair from a stair room on one level up to a stair room on the next. */
export interface Stair { id: string; roomId: string; toRoomId: string; shape: 'straight' | 'u-shaped'; width: Inches; tread: Inches }

/**
 * One line of the design brief the layout is checked against. Areas are square feet and widths are feet,
 * measured to wall centerlines like the plans. `near` lists rooms it must share a wall with.
 */
export interface ProgramItem {
  roomId: string
  need: string
  levelId?: string
  minArea?: number
  minWidth?: number
  near?: string[]
}

export interface HouseModel {
  buildingId: string
  origin: Pt
  levels: Level[]
  concept: true
  wallThickness: WallThickness
  openings: Opening[]
  stairs: Stair[]
  roofs: Roof[]
  /** The brief as checkable requirements. Optional so older saves still load. */
  program?: ProgramItem[]
}

export interface Estate {
  name: string
  layoutVersion: number
  parcel: Parcel
  buildings: Building[]
  zones: Zone[]
  roads: Road[]
  walkways: Walkway[]
  runway: { name: string; rect: Rect }
  house: HouseModel
}

export type CheckStatus = 'pass' | 'warn' | 'fail'
/** `elements` names the buildings, rooms, walkways, or zones a check is about when it does not pass, so views can mark them. */
export interface Check { id: string; label: string; status: CheckStatus; detail: string; elements?: string[] }
