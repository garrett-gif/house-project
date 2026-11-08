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
  /** Actual masses when the building is not a plain rectangle. `rect` remains the overall bounds. */
  parts?: Rect[]
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
export interface Walkway { id: string; name: string; points: Pt[] }

export type RoomType = 'bedroom' | 'bath' | 'living' | 'service' | 'circulation' | 'wellness' | 'garage' | 'pool' | 'outdoor'
export interface Room { id: string; name: string; type: RoomType; rect: Rect; bathId?: string }
export interface Level { id: string; name: string; floorHeight: Inches; elevation: Inches; rooms: Room[] }
export interface HouseModel { buildingId: string; origin: Pt; levels: Level[]; concept: true }

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
export interface Check { id: string; label: string; status: CheckStatus; detail: string }
