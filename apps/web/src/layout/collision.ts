// M4-2 가구 충돌 판정 (순수 함수, mm 정수).
// services/engine/app/geometry.py 의 footprint·Rect.intersects 와 같은 규칙:
//  - 회전 0/90/180/270 → 바닥면은 항상 축 정렬 사각형(AABB)
//  - 90°/270°면 width·depth를 바꾼다
//  - 경계가 맞닿는 것은 겹침이 아니다 (벽에 딱 붙인 가구 허용)
import type { Dimensions, Point2, RoomData, RotationDeg } from '../types/schema'

export interface Rect {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

export interface PlacedItem {
  instanceId: string
  dimensions: Dimensions
  position: Point2
  rotationDeg: RotationDeg
}

export type ViolationCode = 'WALL_OVERLAP' | 'FURNITURE_OVERLAP' | 'CLEARANCE_BLOCKED'

export interface Violation {
  code: ViolationCode
  instanceId: string
  message: string
}

/** 엔진 footprint()와 같은 계산 (hw = width // 2) */
export function footprint(x: number, z: number, width: number, depth: number, rotationDeg: number): Rect {
  if (rotationDeg % 90 !== 0) throw new Error('MVP는 0/90/180/270도만 지원한다')
  if (Math.floor(rotationDeg / 90) % 2 === 1) [width, depth] = [depth, width]
  const hw = Math.floor(width / 2)
  const hd = Math.floor(depth / 2)
  return { minX: x - hw, minZ: z - hd, maxX: x - hw + width, maxZ: z - hd + depth }
}

export const itemRect = (p: PlacedItem) =>
  footprint(p.position.x, p.position.z, p.dimensions.width, p.dimensions.depth, p.rotationDeg)

/** 맞닿는 건 겹침이 아니다 */
export function intersects(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ
}

/** 점이 다각형 안이거나 경계 위인지 */
export function pointInPolygon(p: Point2, poly: Point2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    // 경계 위
    const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)
    if (
      cross === 0 &&
      p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) &&
      p.z >= Math.min(a.z, b.z) && p.z <= Math.max(a.z, b.z)
    ) return true
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

/** 사각형이 바닥 다각형 안에 완전히 들어가는지 (ㄱ자 방도 처리) */
export function rectInsidePolygon(r: Rect, poly: Point2[]): boolean {
  const corners = [
    { x: r.minX, z: r.minZ }, { x: r.maxX, z: r.minZ },
    { x: r.maxX, z: r.maxZ }, { x: r.minX, z: r.maxZ },
  ]
  if (!corners.every((c) => pointInPolygon(c, poly))) return false
  // 오목한 모서리(ㄱ자의 안쪽 꼭짓점)가 사각형 안으로 파고들면 밖으로 나간 것
  return !poly.some((v) => v.x > r.minX && v.x < r.maxX && v.z > r.minZ && v.z < r.maxZ)
}

/** 고정물(라디에이터·기둥 등)의 바닥 사각형. footprint 없는 것(에어컨 등)은 제외 */
export function fixtureRects(room: RoomData): { id: string; type: string; rect: Rect }[] {
  return room.fixtures.flatMap((f) => {
    if (!f.footprint || f.footprint.length < 3) return []
    const xs = f.footprint.map((p) => p.x)
    const zs = f.footprint.map((p) => p.z)
    return [{ id: f.id, type: f.type, rect: { minX: Math.min(...xs), minZ: Math.min(...zs), maxX: Math.max(...xs), maxZ: Math.max(...zs) } }]
  })
}

/** 모든 하드 충돌. 위반이 없으면 빈 배열 → 저장 가능 */
export function findViolations(room: RoomData, items: PlacedItem[]): Violation[] {
  const out: Violation[] = []
  const rects = items.map((p) => ({ id: p.instanceId, rect: itemRect(p) }))
  const fixtures = fixtureRects(room)

  for (const { id, rect } of rects) {
    if (!rectInsidePolygon(rect, room.floorPolygon)) {
      out.push({ code: 'WALL_OVERLAP', instanceId: id, message: '벽 밖으로 나갔어요' })
    }
    for (const fx of fixtures) {
      if (intersects(rect, fx.rect)) {
        out.push({ code: 'CLEARANCE_BLOCKED', instanceId: id, message: `고정물(${fx.type})과 겹쳐요` })
      }
    }
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (intersects(rects[i].rect, rects[j].rect)) {
        out.push({ code: 'FURNITURE_OVERLAP', instanceId: rects[i].id, message: '다른 가구와 겹쳐요' })
        out.push({ code: 'FURNITURE_OVERLAP', instanceId: rects[j].id, message: '다른 가구와 겹쳐요' })
      }
    }
  }
  return out
}

/** 그리드 스냅 (기본 50mm) */
export const snap = (v: number, grid = 50) => Math.round(v / grid) * grid

/** 90° 회전 (반시계, rotationDeg 규약과 같음) */
export const rotate90 = (deg: RotationDeg): RotationDeg => (((deg + 90) % 360) as RotationDeg)
