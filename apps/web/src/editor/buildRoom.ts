// M1-2 자유 모드: 폼 입력값 → RoomData(source: "manual") 변환과 입력 검사.
// UI와 분리된 순수 함수라서 테스트로 검증한다.
import type { Facing, Opening, RoomData, Wall } from '../types/schema'

/** 벽 이름. 평면도 기준 위(N)·오른쪽(E)·아래(S)·왼쪽(W). 위쪽이 −Z. */
export type WallSide = 'N' | 'E' | 'S' | 'W'

export interface OpeningInput {
  key: string
  type: 'door' | 'window'
  wall: WallSide
  /** 벽 시작 모서리에서 문·창 시작까지 거리 (mm) */
  offset: number
  width: number
  height: number
  /** 창문 아래 높이 (문은 0) */
  sillHeight: number
  /** 창문 방위 (모르면 null) */
  facing: Facing
  /** 문 경첩 위치 */
  hingeSide: 'left' | 'right'
  /** 문이 방 안쪽으로 열리는지 */
  opensInward: boolean
}

export interface RoomForm {
  name: string
  /** 가로 (X, mm) */
  width: number
  /** 세로 (Z, mm) */
  depth: number
  ceilingHeight: number
  openings: OpeningInput[]
}

export interface FormError {
  /** 'width' | 'depth' | 'ceilingHeight' | 'openings' 또는 문·창 key */
  target: string
  message: string
}

export const MAX_OPENINGS = 4
export const WALL_THICKNESS = 120
export const LIMITS = {
  side: { min: 1000, max: 20000 },
  ceiling: { min: 2000, max: 5000 }, // room.schema.json의 ceilingHeight 범위
}

export const WALL_LABEL: Record<WallSide, string> = {
  N: '위쪽 벽',
  E: '오른쪽 벽',
  S: '아래쪽 벽',
  W: '왼쪽 벽',
}

/**
 * 벽 4개. 시계 방향으로 돈다 (위 → 오른쪽 → 아래 → 왼쪽).
 * offset은 각 벽의 start 모서리에서 잰다:
 *   N: 왼쪽 위 모서리부터 →, E: 오른쪽 위 모서리부터 ↓, S: 오른쪽 아래 모서리부터 ←, W: 왼쪽 아래 모서리부터 ↑
 */
export function makeWalls(width: number, depth: number, height: number): Record<WallSide, Wall> {
  const w = (id: WallSide, sx: number, sz: number, ex: number, ez: number): Wall => ({
    id: `wall_${id}`,
    start: { x: sx, z: sz },
    end: { x: ex, z: ez },
    height,
    thickness: WALL_THICKNESS,
  })
  return {
    N: w('N', 0, 0, width, 0),
    E: w('E', width, 0, width, depth),
    S: w('S', width, depth, 0, depth),
    W: w('W', 0, depth, 0, 0),
  }
}

export function wallLength(form: Pick<RoomForm, 'width' | 'depth'>, side: WallSide) {
  return side === 'N' || side === 'S' ? form.width : form.depth
}

/** 숫자가 cm로 입력된 것처럼 보이면 안내 문구를 돌려준다. */
function unitHint(value: number) {
  return value > 0 && value < 100 ? ' (cm로 입력하셨나요? 단위는 mm예요. 예: 3.2m = 3200)' : ''
}

/** 입력 검사. 빈 배열이면 저장 가능. */
export function validateForm(form: RoomForm): FormError[] {
  const errors: FormError[] = []
  const checkRange = (target: string, label: string, v: number, min: number, max: number) => {
    if (!Number.isInteger(v) || v < min || v > max) {
      errors.push({ target, message: `${label}는 ${min}~${max}mm 사이 정수여야 해요${unitHint(v)}` })
    }
  }
  checkRange('width', '가로', form.width, LIMITS.side.min, LIMITS.side.max)
  checkRange('depth', '세로', form.depth, LIMITS.side.min, LIMITS.side.max)
  checkRange('ceilingHeight', '천장 높이', form.ceilingHeight, LIMITS.ceiling.min, LIMITS.ceiling.max)

  if (form.openings.length > MAX_OPENINGS) {
    errors.push({ target: 'openings', message: `문·창문은 최대 ${MAX_OPENINGS}개까지예요` })
  }

  for (const o of form.openings) {
    const name = o.type === 'door' ? '문' : '창문'
    const len = wallLength(form, o.wall)
    if (!Number.isInteger(o.width) || o.width < 300) {
      errors.push({ target: o.key, message: `${name} 폭은 300mm 이상이어야 해요${unitHint(o.width)}` })
    }
    if (!Number.isInteger(o.offset) || o.offset < 0) {
      errors.push({ target: o.key, message: `${name} 거리는 0 이상이어야 해요` })
    } else if (o.offset + o.width > len) {
      errors.push({ target: o.key, message: `${name}이 ${WALL_LABEL[o.wall]}(${len}mm) 밖으로 나가요` })
    }
    if (o.sillHeight < 0 || o.sillHeight + o.height > form.ceilingHeight) {
      errors.push({ target: o.key, message: `${name} 높이(하단 ${o.sillHeight} + 높이 ${o.height})가 천장보다 높아요` })
    }
  }

  // 같은 벽에서 겹치는지 (구간이 맞닿는 건 허용)
  for (let i = 0; i < form.openings.length; i++) {
    for (let j = i + 1; j < form.openings.length; j++) {
      const a = form.openings[i]
      const b = form.openings[j]
      if (a.wall !== b.wall) continue
      if (a.offset < b.offset + b.width && b.offset < a.offset + a.width) {
        errors.push({ target: b.key, message: `${WALL_LABEL[a.wall]}에서 다른 문·창문과 겹쳐요` })
      }
    }
  }
  return errors
}

/** 'room_' + 시간 기반 ID. 서버 저장 시 서버가 정식 ULID를 다시 줄 수 있다. */
export function newRoomId(now = Date.now()) {
  return `room_${now.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

/** 폼 → RoomData. 검사는 validateForm으로 따로 한다. */
export function buildRoomFromForm(
  form: RoomForm,
  opts: { roomId?: string; ownerId?: string; now?: Date } = {},
): RoomData {
  const now = (opts.now ?? new Date()).toISOString()
  const walls = makeWalls(form.width, form.depth, form.ceilingHeight)
  const openings: Opening[] = form.openings.map((o, i) => ({
    id: `${o.type === 'door' ? 'door' : 'win'}_${i + 1}`,
    type: o.type,
    wallId: walls[o.wall].id,
    offset: o.offset,
    width: o.width,
    height: o.height,
    sillHeight: o.type === 'door' ? 0 : o.sillHeight,
    facing: o.type === 'window' ? o.facing : null,
    swing:
      o.type === 'door'
        ? { kind: 'hinged', hingeSide: o.hingeSide, opensInward: o.opensInward, maxAngleDeg: 90 }
        : null,
  }))

  return {
    schemaVersion: '1.0',
    roomId: opts.roomId ?? newRoomId(),
    ownerId: opts.ownerId ?? 'user_local',
    name: form.name.trim() || '내 방',
    source: 'manual',
    unit: 'mm',
    ceilingHeight: form.ceilingHeight,
    floorPolygon: [
      { x: 0, z: 0 },
      { x: form.width, z: 0 },
      { x: form.width, z: form.depth },
      { x: 0, z: form.depth },
    ],
    walls: [walls.N, walls.E, walls.S, walls.W],
    openings,
    fixtures: [],
    existingFurniture: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** 새 문·창문 기본값 */
export function newOpening(type: 'door' | 'window', key: string): OpeningInput {
  return type === 'door'
    ? { key, type, wall: 'S', offset: 300, width: 900, height: 2100, sillHeight: 0, facing: null, hingeSide: 'left', opensInward: true }
    : { key, type, wall: 'N', offset: 800, width: 1200, height: 1200, sillHeight: 900, facing: 'N', hingeSide: 'left', opensInward: false }
}
