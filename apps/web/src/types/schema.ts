// RoomData 타입 (packages/schema/room.schema.json 기준, v1.0)
// TODO: 스키마에서 타입을 자동 생성하는 방식이 정해지면 이 파일을 생성된 타입으로 교체한다.
//       직접 필드를 추가·변경하지 말 것 (스키마가 유일한 원본).

export type Mm = number

export interface Point2 { x: Mm; z: Mm }
export interface Point3 { x: Mm; y: Mm; z: Mm }
export interface Dimensions { width: Mm; depth: Mm; height: Mm }

export type Category =
  | 'bed' | 'desk' | 'chair' | 'storage' | 'shelf' | 'table'
  | 'wardrobe' | 'sofa' | 'lamp' | 'decor' | 'etc'
export type RotationDeg = 0 | 90 | 180 | 270
export type Facing = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | null

export interface Wall {
  id: string
  start: Point2
  end: Point2
  height: Mm
  thickness: Mm
}

export interface Swing {
  kind: 'hinged' | 'sliding'
  hingeSide: 'left' | 'right'
  opensInward: boolean
  maxAngleDeg: number
}

export interface Opening {
  id: string
  type: 'door' | 'window' | 'opening'
  wallId: string
  /** 벽 start에서 개구부 시작 모서리까지 거리 */
  offset: Mm
  width: Mm
  height: Mm
  sillHeight: Mm
  facing?: Facing
  swing: Swing | null
}

export interface Fixture {
  id: string
  type: 'radiator' | 'pillar' | 'outlet' | 'aircon' | 'sink' | 'closet_builtin'
  footprint?: Point2[]
  height?: Mm
  position?: Point3
  direction?: Point2
}

export interface FurnitureInstance {
  instanceId: string
  category: Category
  catalogItemId?: string | null
  label?: string
  dimensions: Dimensions
  /** 바닥면 중심 */
  position: Point2
  rotationDeg: RotationDeg
  movable: boolean
  detectedBy?: 'roomplan' | 'user'
  confidence?: 'high' | 'medium' | 'low'
}

export interface RoomData {
  schemaVersion: '1.0'
  roomId: string
  ownerId: string
  name: string
  source: 'lidar' | 'manual' | 'template' | 'floorplan'
  sourceMeta?: Record<string, string | null>
  unit: 'mm'
  ceilingHeight: Mm
  floorPolygon: Point2[]
  walls: Wall[]
  openings: Opening[]
  fixtures: Fixture[]
  existingFurniture: FurnitureInstance[]
  createdAt: string
  updatedAt: string
}

// FurnitureLayout (furniture-layout.schema.json) 중 3D 렌더에 필요한 부분만.
// 전체 필드는 스키마 참고. 위와 마찬가지로 자동 생성 타입이 생기면 교체한다.
export interface Placement {
  instanceId: string
  source: 'existing' | 'catalog' | 'custom'
  catalogItemId?: string | null
  category: string
  dimensions: Dimensions
  position: Point2
  rotationDeg: RotationDeg
  locked: boolean
}

export interface FurnitureLayout {
  schemaVersion: '1.0'
  layoutId: string
  roomId: string
  title: string
  placements: Placement[]
  [key: string]: unknown
}
