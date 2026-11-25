import { describe, expect, it } from 'vitest'
import roomSample from '@schema/fixtures/room.sample.json'
import tpl6 from '@schema/fixtures/templates/tpl-6py-studio.json'
import type { RoomData } from '../types/schema'
import {
  findViolations, footprint, intersects, pointInPolygon, rectInsidePolygon, rotate90, snap, type PlacedItem,
} from './collision'

const room = roomSample as RoomData
const item = (id: string, x: number, z: number, w: number, d: number, rot: 0 | 90 | 180 | 270 = 0): PlacedItem => ({
  instanceId: id, dimensions: { width: w, depth: d, height: 500 }, position: { x, z }, rotationDeg: rot,
})

describe('footprint (engine geometry.py와 같은 값)', () => {
  it('회전 0: 중심 (600,3700), 1100×2000 → x 50~1150, z 2700~4700', () => {
    expect(footprint(600, 3700, 1100, 2000, 0)).toEqual({ minX: 50, minZ: 2700, maxX: 1150, maxZ: 4700 })
  })
  it('회전 90: 가로·세로가 바뀐다 → x -400~1600, z 3150~4250', () => {
    expect(footprint(600, 3700, 1100, 2000, 90)).toEqual({ minX: -400, minZ: 3150, maxX: 1600, maxZ: 4250 })
  })
  it('홀수 폭은 엔진처럼 hw = width // 2 (1001 → 500)', () => {
    expect(footprint(1000, 1000, 1001, 600, 0)).toEqual({ minX: 500, minZ: 700, maxX: 1501, maxZ: 1300 })
  })
})

describe('intersects', () => {
  it('맞닿으면 겹침 아님, 1mm라도 들어가면 겹침', () => {
    const a = { minX: 0, minZ: 0, maxX: 1000, maxZ: 1000 }
    expect(intersects(a, { minX: 1000, minZ: 0, maxX: 2000, maxZ: 1000 })).toBe(false)
    expect(intersects(a, { minX: 999, minZ: 0, maxX: 2000, maxZ: 1000 })).toBe(true)
  })
})

describe('바닥 안에 있는지', () => {
  const rectRoom = room.floorPolygon
  it('경계 위 점은 안쪽으로 본다', () => {
    expect(pointInPolygon({ x: 0, z: 0 }, rectRoom)).toBe(true)
    expect(pointInPolygon({ x: 3200, z: 2000 }, rectRoom)).toBe(true)
    expect(pointInPolygon({ x: 3201, z: 2000 }, rectRoom)).toBe(false)
  })
  it('ㄱ자 6평: 잘린 모서리(x 3200~4600, z 0~1600)에 놓으면 밖', () => {
    const poly = (tpl6 as RoomData).floorPolygon
    expect(rectInsidePolygon({ minX: 3300, minZ: 200, maxX: 3800, maxZ: 800 }, poly)).toBe(false)
    expect(rectInsidePolygon({ minX: 3300, minZ: 2000, maxX: 3800, maxZ: 2600 }, poly)).toBe(true)
    // 오목한 꼭짓점 (3200,1600)을 가로지르는 사각형 → 네 꼭짓점은 안이어도 밖으로 판정
    expect(rectInsidePolygon({ minX: 2800, minZ: 1200, maxX: 3600, maxZ: 2000 }, poly)).toBe(false)
  })
})

describe('findViolations (room.sample: 3200×4800, 창 아래 라디에이터 x 800~2400, z 0~80)', () => {
  it('기존 침대 위치는 위반 없음', () => {
    expect(findViolations(room, [item('bed', 600, 3700, 1100, 2000)])).toEqual([])
  })
  it('벽에 딱 붙인 가구는 허용 (x 0~1100)', () => {
    expect(findViolations(room, [item('bed', 550, 3700, 1100, 2000)])).toEqual([])
  })
  it('벽 밖으로 50mm 나가면 WALL_OVERLAP', () => {
    expect(findViolations(room, [item('bed', 500, 3700, 1100, 2000)]).map((v) => v.code)).toEqual(['WALL_OVERLAP'])
  })
  it('침대를 90° 돌리면 벽 밖 (x -400)', () => {
    expect(findViolations(room, [item('bed', 600, 3700, 1100, 2000, 90)]).map((v) => v.code)).toEqual(['WALL_OVERLAP'])
  })
  it('가구끼리 겹치면 두 가구 모두 FURNITURE_OVERLAP', () => {
    const v = findViolations(room, [item('bed', 600, 3700, 1100, 2000), item('desk', 1300, 3700, 600, 600)])
    expect(v.map((x) => [x.code, x.instanceId])).toEqual([
      ['FURNITURE_OVERLAP', 'bed'],
      ['FURNITURE_OVERLAP', 'desk'],
    ])
  })
  it('라디에이터와 겹치면 CLEARANCE_BLOCKED (z 0~400 책상)', () => {
    expect(findViolations(room, [item('desk', 1600, 200, 1200, 400)]).map((v) => v.code)).toEqual(['CLEARANCE_BLOCKED'])
  })
})

describe('snap / rotate90', () => {
  it('50mm 스냅', () => {
    expect(snap(1224)).toBe(1200)
    expect(snap(1225)).toBe(1250)
  })
  it('0 → 90 → 180 → 270 → 0', () => {
    expect(rotate90(0)).toBe(90)
    expect(rotate90(270)).toBe(0)
  })
})
