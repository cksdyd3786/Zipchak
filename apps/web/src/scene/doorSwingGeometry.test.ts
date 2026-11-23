import { describe, expect, it } from 'vitest'
import roomSample from '@schema/fixtures/room.sample.json'
import type { Opening, RoomData, Wall } from '../types/schema'
import { doorSwingSector, doorSwingSectors } from './doorSwingGeometry'

const room = roomSample as RoomData
const center = { x: 1600, z: 2400 } // 3200 × 4800 방 중심
const wallS = room.walls.find((w) => w.id === 'wall_S')!
const door = room.openings.find((o) => o.id === 'door_main')!

const withSwing = (patch: Partial<NonNullable<Opening['swing']>>): Opening => ({
  ...door,
  swing: { ...door.swing!, ...patch },
})

describe('doorSwingSector (room.sample의 door_main)', () => {
  // 아래쪽 벽 wall_S: (3200,4800) → (0,4800), offset 300, 폭 900
  // → 문 양 끝 A=(2900,4800), B=(2000,4800). 방 안쪽은 -Z.
  // 방 안에서 아래쪽 벽을 보면(+Z 방향) 왼손이 +X → hingeSide 'left' = A(2900,4800)

  it('경첩 left, 안쪽 열림 90°: 경첩 (2900,4800), 호는 (2000,4800) → (2900,3900)', () => {
    const s = doorSwingSector(wallS, door, center)!
    expect(s.hinge).toEqual({ x: 2900, z: 4800 })
    expect(s.radius).toBe(900)
    expect(s.polygon[0]).toEqual({ x: 2900, z: 4800 })
    expect(s.polygon[1]).toEqual({ x: 2000, z: 4800 })
    expect(s.polygon.at(-1)).toEqual({ x: 2900, z: 3900 })
  })

  it('부채꼴 점은 모두 방 안쪽(z ≤ 4800)이고 경첩에서 900 이내', () => {
    const s = doorSwingSector(wallS, door, center)!
    for (const p of s.polygon) {
      expect(p.z).toBeLessThanOrEqual(4800)
      expect(Math.hypot(p.x - 2900, p.z - 4800)).toBeLessThanOrEqual(901)
    }
  })

  it('경첩 right면 경첩이 (2000,4800), 호 끝은 (2000,3900)', () => {
    const s = doorSwingSector(wallS, withSwing({ hingeSide: 'right' }), center)!
    expect(s.hinge).toEqual({ x: 2000, z: 4800 })
    expect(s.polygon.at(-1)).toEqual({ x: 2000, z: 3900 })
  })

  it('바깥 열림이면 방 밖(+Z)으로: 호 끝 (2900,5700)', () => {
    const s = doorSwingSector(wallS, withSwing({ opensInward: false }), center)!
    expect(s.polygon.at(-1)).toEqual({ x: 2900, z: 5700 })
  })

  it('maxAngleDeg 45: 호 끝은 45° 지점', () => {
    const s = doorSwingSector(wallS, withSwing({ maxAngleDeg: 45 }), center)!
    const r = Math.round(900 * Math.SQRT1_2) // 636
    expect(s.polygon.at(-1)).toEqual({ x: 2900 - r, z: 4800 - r })
  })

  it('미닫이·각도 0·창문은 부채꼴 없음', () => {
    expect(doorSwingSector(wallS, withSwing({ kind: 'sliding' }), center)).toBeNull()
    expect(doorSwingSector(wallS, withSwing({ maxAngleDeg: 0 }), center)).toBeNull()
    const win = room.openings.find((o) => o.type === 'window')!
    expect(doorSwingSector(room.walls[0], win, center)).toBeNull()
  })
})

describe('doorSwingSectors', () => {
  it('room.sample에는 문 1개 → 부채꼴 1개', () => {
    expect(doorSwingSectors(room.walls, room.openings, center).map((s) => s.openingId)).toEqual(['door_main'])
  })

  it('위쪽 벽(+X 방향) 문, 경첩 left: 방 안에서 위쪽 벽을 보면 왼손이 -X', () => {
    const wallN: Wall = { id: 'wall_N', start: { x: 0, z: 0 }, end: { x: 3200, z: 0 }, height: 2400, thickness: 120 }
    const d: Opening = { ...door, wallId: 'wall_N', offset: 1000, width: 800 }
    const s = doorSwingSector(wallN, d, center)!
    // 문 양 끝 (1000,0)·(1800,0), 왼쪽(-X) = (1000,0), 안쪽 = +Z
    expect(s.hinge).toEqual({ x: 1000, z: 0 })
    expect(s.polygon.at(-1)).toEqual({ x: 1000, z: 800 })
  })
})
