// M4-3 문 회전 반경(부채꼴) 계산. 순수 함수 → 테스트로 검증.
//
// hingeSide 기준 (팀 확인 필요): 방 안쪽에 서서 문(벽)을 바라볼 때 왼손 쪽이 'left'.
// opensInward=true면 부채꼴은 방 안쪽, false면 방 바깥쪽에 그린다.
import type { Opening, Point2, Wall } from '../types/schema'

export interface SwingSector {
  openingId: string
  /** 경첩 위치 (mm) */
  hinge: Point2
  /** 반지름 = 문 폭 (mm) */
  radius: number
  /** 부채꼴 외곽 점들. [경첩, 호의 시작 … 호의 끝] (mm) */
  polygon: Point2[]
}

const ARC_SEGMENTS = 24

/**
 * 문 하나의 회전 반경 부채꼴. 미닫이·각도 0·창문이면 null.
 * @param roomCenter 방 안쪽 방향을 정하는 기준점 (바닥 바운딩 박스 중심)
 */
export function doorSwingSector(wall: Wall, door: Opening, roomCenter: Point2): SwingSector | null {
  if (door.type !== 'door' || !door.swing) return null
  if (door.swing.kind !== 'hinged' || door.swing.maxAngleDeg <= 0) return null

  const dx = wall.end.x - wall.start.x
  const dz = wall.end.z - wall.start.z
  const len = Math.hypot(dx, dz)
  if (len === 0) return null
  const u = { x: dx / len, z: dz / len } // 벽 방향 단위 벡터

  // 문 양 끝점
  const a = { x: wall.start.x + u.x * door.offset, z: wall.start.z + u.z * door.offset }
  const b = { x: a.x + u.x * door.width, z: a.z + u.z * door.width }
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }

  // 방 안쪽 법선: 벽에 수직이면서 방 중심을 향하는 쪽
  let inward = { x: -u.z, z: u.x }
  if ((roomCenter.x - mid.x) * inward.x + (roomCenter.z - mid.z) * inward.z < 0) {
    inward = { x: -inward.x, z: -inward.z }
  }

  // 방 안에서 벽을 바라보는 방향 d = -inward, 그 사람의 왼쪽 = (d.z, -d.x)
  const left = { x: -inward.z, z: inward.x }
  const aIsLeft = (a.x - mid.x) * left.x + (a.z - mid.z) * left.z > 0
  const hingeIsA = door.swing.hingeSide === 'left' ? aIsLeft : !aIsLeft
  const hinge = hingeIsA ? a : b
  const tip = hingeIsA ? b : a

  // 닫힌 문 방향 v0 → 열리는 쪽 s 로 maxAngle만큼 회전 (v0 ⟂ s)
  const v0 = { x: (tip.x - hinge.x) / door.width, z: (tip.z - hinge.z) / door.width }
  const s = door.swing.opensInward ? inward : { x: -inward.x, z: -inward.z }
  const maxRad = (door.swing.maxAngleDeg * Math.PI) / 180

  const polygon: Point2[] = [hinge]
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = (maxRad * i) / ARC_SEGMENTS
    polygon.push({
      x: Math.round(hinge.x + door.width * (v0.x * Math.cos(t) + s.x * Math.sin(t))),
      z: Math.round(hinge.z + door.width * (v0.z * Math.cos(t) + s.z * Math.sin(t))),
    })
  }
  return { openingId: door.id, hinge, radius: door.width, polygon }
}

/** 방의 모든 문에 대한 부채꼴 */
export function doorSwingSectors(walls: Wall[], openings: Opening[], roomCenter: Point2): SwingSector[] {
  return openings.flatMap((o) => {
    const wall = walls.find((w) => w.id === o.wallId)
    const sector = wall ? doorSwingSector(wall, o, roomCenter) : null
    return sector ? [sector] : []
  })
}
