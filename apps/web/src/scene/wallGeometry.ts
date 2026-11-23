// 벽 기하 계산 (순수 함수). 컴포넌트 파일과 분리해야 Fast Refresh가 동작한다.
import type { Opening, Point2, Wall } from '../types/schema'

/** 벽 한 장을 개구부(문·창) 자리만 비워서 여러 조각의 박스로 그린다. */
export interface Piece {
  /** 벽 start에서 조각 시작까지 거리 (mm) */
  from: number
  to: number
  /** 바닥에서 조각 아래·위 높이 (mm) */
  bottom: number
  top: number
}

export function wallPieces(length: number, height: number, openings: Opening[]): Piece[] {
  const pieces: Piece[] = []
  const sorted = [...openings].sort((a, b) => a.offset - b.offset)
  let cursor = 0
  for (const o of sorted) {
    const start = Math.max(o.offset, cursor)
    const end = Math.min(o.offset + o.width, length)
    if (start > cursor) pieces.push({ from: cursor, to: start, bottom: 0, top: height })
    if (end > start) {
      if (o.sillHeight > 0) pieces.push({ from: start, to: end, bottom: 0, top: o.sillHeight })
      const lintel = o.sillHeight + o.height
      if (lintel < height) pieces.push({ from: start, to: end, bottom: lintel, top: height })
    }
    cursor = Math.max(cursor, end)
  }
  if (cursor < length) pieces.push({ from: cursor, to: length, bottom: 0, top: height })
  return pieces
}

/** 벽 로컬 좌표계: start가 원점, 로컬 +X가 벽 진행 방향. 반환값은 Y축 회전(라디안). */
export function wallFrame(wall: Wall) {
  const dx = wall.end.x - wall.start.x
  const dz = wall.end.z - wall.start.z
  const length = Math.hypot(dx, dz)
  // Y축으로 θ 회전하면 로컬 +X → (cosθ, 0, -sinθ) 이므로 θ = atan2(-dz, dx)
  const angle = Math.atan2(-dz, dx)
  return { length, angle }
}

/** 벽 두께를 방 바깥쪽으로 붙이기 위한 부호 (+1이면 로컬 +Z가 바깥) */
export function outwardSign(wall: Wall, center: Point2, angle: number) {
  const midX = (wall.start.x + wall.end.x) / 2
  const midZ = (wall.start.z + wall.end.z) / 2
  // 로컬 +Z의 월드 방향 = (sinθ, cosθ)
  const dot = (midX - center.x) * Math.sin(angle) + (midZ - center.z) * Math.cos(angle)
  return dot >= 0 ? 1 : -1
}
