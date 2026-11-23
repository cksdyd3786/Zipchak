import { describe, expect, it } from 'vitest'
import type { Opening, Wall } from '../types/schema'
import { outwardSign, wallFrame, wallPieces } from './wallGeometry'

const opening = (o: Partial<Opening>): Opening => ({
  id: 'o', type: 'window', wallId: 'w', offset: 0, width: 1000, height: 1000, sillHeight: 0, swing: null, ...o,
})

describe('wallPieces', () => {
  it('개구부가 없으면 벽 전체 한 조각', () => {
    expect(wallPieces(3200, 2400, [])).toEqual([{ from: 0, to: 3200, bottom: 0, top: 2400 }])
  })

  it('창문(room.sample win_1): 좌·우 벽, 창 아래(0~900), 창 위(2100~2400)', () => {
    // 3200mm 벽, offset 800, 폭 1600, 창턱 900, 높이 1200 → 창 위 = 900+1200 = 2100
    const pieces = wallPieces(3200, 2400, [opening({ offset: 800, width: 1600, sillHeight: 900, height: 1200 })])
    expect(pieces).toEqual([
      { from: 0, to: 800, bottom: 0, top: 2400 },
      { from: 800, to: 2400, bottom: 0, top: 900 },
      { from: 800, to: 2400, bottom: 2100, top: 2400 },
      { from: 2400, to: 3200, bottom: 0, top: 2400 },
    ])
  })

  it('문(창턱 0): 아래 조각 없이 문 위만', () => {
    // offset 300, 폭 900, 높이 2100 → 300~1200 구간은 2100~2400만 남는다
    const pieces = wallPieces(3200, 2400, [opening({ type: 'door', offset: 300, width: 900, height: 2100 })])
    expect(pieces).toEqual([
      { from: 0, to: 300, bottom: 0, top: 2400 },
      { from: 300, to: 1200, bottom: 2100, top: 2400 },
      { from: 1200, to: 3200, bottom: 0, top: 2400 },
    ])
  })

  it('천장까지 닿는 개구부는 위 조각도 없다', () => {
    const pieces = wallPieces(2000, 2400, [opening({ offset: 500, width: 1000, height: 2400 })])
    expect(pieces).toEqual([
      { from: 0, to: 500, bottom: 0, top: 2400 },
      { from: 1500, to: 2000, bottom: 0, top: 2400 },
    ])
  })

  it('벽 끝을 넘는 개구부는 벽 길이에서 자른다', () => {
    const pieces = wallPieces(2000, 2400, [opening({ offset: 1500, width: 1000, sillHeight: 1000, height: 1000 })])
    expect(pieces).toEqual([
      { from: 0, to: 1500, bottom: 0, top: 2400 },
      { from: 1500, to: 2000, bottom: 0, top: 1000 },
      { from: 1500, to: 2000, bottom: 2000, top: 2400 },
    ])
  })
})

describe('wallFrame / outwardSign', () => {
  const wall = (sx: number, sz: number, ex: number, ez: number): Wall => ({
    id: 'w', start: { x: sx, z: sz }, end: { x: ex, z: ez }, height: 2400, thickness: 120,
  })
  // 3200 × 4800 방의 중심
  const center = { x: 1600, z: 2400 }

  it('+X 방향 벽(wall_N)은 회전 0, 길이 3200', () => {
    const { length, angle } = wallFrame(wall(0, 0, 3200, 0))
    expect(length).toBe(3200)
    expect(angle).toBeCloseTo(0)
  })

  it('+Z 방향 벽(wall_E)은 -90°(로컬 +X가 월드 +Z를 향함)', () => {
    const { angle } = wallFrame(wall(3200, 0, 3200, 4800))
    expect(angle).toBeCloseTo(-Math.PI / 2)
  })

  it('북쪽 벽(z=0)의 두께는 방 바깥(-Z)으로 붙는다', () => {
    const w = wall(0, 0, 3200, 0)
    const { angle } = wallFrame(w)
    // 회전 0에서 로컬 +Z = 월드 +Z(방 안쪽) → 바깥은 -1
    expect(outwardSign(w, center, angle)).toBe(-1)
  })

  it('남쪽 벽(z=4800, -X 방향)의 두께는 방 바깥(+Z)으로 붙는다', () => {
    const w = wall(3200, 4800, 0, 4800)
    const { angle } = wallFrame(w)
    // 회전 180°에서 로컬 +Z = 월드 -Z(방 안쪽) → 바깥은 -1
    expect(outwardSign(w, center, angle)).toBe(-1)
  })
})
