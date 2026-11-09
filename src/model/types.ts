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
  /** Ember and flame resistance. Absent means not decided yet. */
  ignition?: Ignition
  /** Actual masses above grade when the building is not a plain rectangle. `rect` remains the overall bounds. */
  parts?: Rect[]
  /** Footprint on every level, including rooms below grade. Collisions use this. Absent means the same as `parts`. */
  footprint?: Rect[]
  /** People sleeping here at peak. Absent means none, except the main house, which counts two per bedroom. */
  beds?: number
  /** Daytime staff, students, or visitors at peak who do not sleep here. */
  staff?: number
  /** Keeps power in an outage: on a generator. */
  backupPower?: boolean
  /** Stores fuel, so wells keep their distance. */
  fuelStorage?: boolean
  /** Peak electrical demand in kW when the estimate from floor area does not fit, as for RV hookups or helipads. */
  loadKw?: number
}

export interface Zone {
  id: string
  name: string
  kind: ZoneKind
  access: Access
  rect: Rect
  /** Cleared or developed land. Thinned forest and training ground stay false. */
  cleared: boolean
  /** Paved or graveled yard, parking, or apron that a fire engine can drive onto. */
  hardstand?: boolean
  /** Parking lot. Spaces are counted from its area. */
  parking?: boolean
  round?: boolean
}

/**
 * `width` is the drivable width; absent means the default for its kind. `turnaround` marks a turnaround for fire
 * apparatus at the road's last point.
 */
export interface Road { id: string; name: string; kind: RoadKind; points: Pt[]; gate?: string; width?: Inches; turnaround?: boolean }

/** Water a fire crew can draft or pump from, with a fill point or dry hydrant at `at`. */
export interface WaterSource { id: string; name: string; kind: 'cistern' | 'pond' | 'hydrant'; at: Pt; gallons: number }

/** How a building resists embers and flame. Absent means not decided yet. */
export interface Ignition {
  /** Fire-tested roof classification. Class A resists the most severe exposure. */
  roofClass: 'A' | 'B' | 'C' | 'unrated'
  /** Vents screened or built to resist embers. */
  emberVents: boolean
  /** Eaves boxed in with soffits, rather than open rafters. */
  enclosedEaves: boolean
  /** Decks and porches: none, built of noncombustible materials, or combustible and open underneath. */
  decks: 'none' | 'noncombustible' | 'combustible'
}

/**
 * Planning values for wildfire and fire access. Defaults follow common wildland-urban interface guidance and are
 * meant to be replaced with the owner's own standards or the local fire authority's.
 */
export interface FireRules {
  /** Distances in feet from a building: the ember-resistant zone, the lean, clean, and green zone, and the reduced-fuel zone. */
  zones: [number, number, number]
  minRoadWidthFt: number
  maxHosePullFt: number
  maxDeadEndFt: number
  maxWaterDistanceFt: number
  minWaterGallons: number
}
export type UtilityKind = 'well' | 'storage' | 'septic' | 'service' | 'solar' | 'generator' | 'propane'

/**
 * A utility on the site: what it occupies (`rect`, site inches, cleared ground) and the buildings it serves.
 * `capacity` is in the unit of its kind: well gallons per minute, storage gallons, septic gallons per day of design
 * flow (`rect` is the drainfield, primary and reserve), service, solar, and generator kW, propane tank gallons.
 */
export interface Utility { id: string; name: string; kind: UtilityKind; rect: Rect; capacity: number; serves: string[] }

/**
 * A camera or light. `range` is how far a camera sees or a light reaches. Cameras look toward `facing` (degrees,
 * 0 east, 90 north) across a `fov` degree view. `on` is a building the device is mounted on; it moves with it.
 * `power` says what keeps it on: grid only, the backup generator, or its own solar panel and battery.
 */
export interface SecurityDevice {
  id: string
  name: string
  kind: 'camera' | 'light'
  at: Pt
  range: Inches
  facing?: number
  fov?: number
  on?: string
  power: 'grid' | 'backup' | 'solar'
}

/** Owner-replaceable planning values for utilities and security. See DEFAULT_UTILITY_RULES. */
export interface UtilityRules {
  waterGpdPerBed: number
  waterGpdPerStaff: number
  sewageGpdPerBed: number
  sewageGpdPerStaff: number
  drainfieldGpdPerSqFt: number
  drainfieldReserve: number
  wellPumpHours: number
  storageDays: number
  backupShare: number
  wellToSepticFt: number
  wellToFuelFt: number
  septicToBuildingFt: number
  septicToWaterFt: number
  solarShadeFt: number
  maxTrenchFt: number
  sqFtPerParkingSpace: number
  cameraForestFt: number
  approachFt: number
  backupFeedFt: number
}

/** `from` and `to` are building ids. Moving one of those buildings moves that end of the walkway with it. */
export interface Walkway { id: string; name: string; points: Pt[]; from?: string; to?: string }

export type RoomType = 'bedroom' | 'bath' | 'living' | 'service' | 'circulation' | 'wellness' | 'garage' | 'pool' | 'outdoor'
/**
 * `twoStory` rooms are open to the floor above, so their walls rise through it to the roof. `safeRoom` marks a room
 * built to shelter in.
 */
export interface Room { id: string; name: string; type: RoomType; rect: Rect; bathId?: string; twoStory?: boolean; safeRoom?: boolean }
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
  /** Other detailed buildings with their own rooms, such as the guest house. Ids are unique across all houses. */
  houses?: HouseModel[]
  /** Fire water. Optional so older saves still load. */
  waterSources?: WaterSource[]
  /** Owner's planning values for wildfire checks. Absent means the defaults. */
  fireRules?: FireRules
  /** Wells, septic, power, solar, generators, propane. Optional so older saves still load. */
  utilities?: Utility[]
  /** Cameras and lights. */
  security?: SecurityDevice[]
  /** Owner's planning values for utility and security checks; missing values use the defaults. */
  utilityRules?: Partial<UtilityRules>
}

export type CheckStatus = 'pass' | 'warn' | 'fail'
/** `elements` names the buildings, rooms, walkways, or zones a check is about when it does not pass, so views can mark them. */
export interface Check { id: string; label: string; status: CheckStatus; detail: string; elements?: string[] }
