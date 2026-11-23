import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import roomSchema from '@schema/room.schema.json'
import { buildRoomFromForm, newOpening, validateForm, type RoomForm } from './buildRoom'

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validateSchema = ajv.compile(roomSchema)

const baseForm = (): RoomForm => ({
  name: '테스트 방',
  width: 3200,
  depth: 4800,
  ceilingHeight: 2400,
  openings: [newOpening('door', 'd1'), newOpening('window', 'w1')],
})

describe('buildRoomFromForm', () => {
  it('결과가 room.schema.json을 통과한다', () => {
    const room = buildRoomFromForm(baseForm(), { now: new Date('2026-11-23T00:00:00Z') })
    const ok = validateSchema(room)
    expect(validateSchema.errors ?? []).toEqual([])
    expect(ok).toBe(true)
    expect(room.source).toBe('manual')
  })

  it('3200×4800 방: 바닥 꼭짓점과 벽 4개(시계 방향)', () => {
    const room = buildRoomFromForm(baseForm())
    expect(room.floorPolygon).toEqual([
      { x: 0, z: 0 }, { x: 3200, z: 0 }, { x: 3200, z: 4800 }, { x: 0, z: 4800 },
    ])
    expect(room.walls.map((w) => [w.id, w.start, w.end])).toEqual([
      ['wall_N', { x: 0, z: 0 }, { x: 3200, z: 0 }],
      ['wall_E', { x: 3200, z: 0 }, { x: 3200, z: 4800 }],
      ['wall_S', { x: 3200, z: 4800 }, { x: 0, z: 4800 }],
      ['wall_W', { x: 0, z: 4800 }, { x: 0, z: 0 }],
    ])
  })

  it('문은 sill 0·swing 있음, 창문은 swing null·facing 유지', () => {
    const room = buildRoomFromForm(baseForm())
    const door = room.openings.find((o) => o.type === 'door')!
    const win = room.openings.find((o) => o.type === 'window')!
    expect(door).toMatchObject({ wallId: 'wall_S', offset: 300, width: 900, sillHeight: 0, facing: null })
    expect(door.swing).toEqual({ kind: 'hinged', hingeSide: 'left', opensInward: true, maxAngleDeg: 90 })
    expect(win).toMatchObject({ wallId: 'wall_N', sillHeight: 900, facing: 'N', swing: null })
  })
})

describe('validateForm', () => {
  it('정상 입력이면 오류 없음', () => {
    expect(validateForm(baseForm())).toEqual([])
  })

  it('cm로 입력한 것 같으면 단위 안내', () => {
    const errors = validateForm({ ...baseForm(), width: 32 })
    expect(errors[0].target).toBe('width')
    expect(errors[0].message).toContain('cm로 입력')
  })

  it('천장 높이는 스키마 범위(2000~5000)', () => {
    expect(validateForm({ ...baseForm(), ceilingHeight: 1900 }).map((e) => e.target)).toContain('ceilingHeight')
  })

  it('문이 벽 밖으로 나가면 오류 (3200 벽에 offset 2500 + 폭 900 = 3400)', () => {
    const form = baseForm()
    form.openings[0] = { ...form.openings[0], offset: 2500 }
    expect(validateForm(form).map((e) => e.target)).toEqual(['d1'])
  })

  it('같은 벽에서 겹치면 오류, 맞닿기만 하면 통과', () => {
    const form = baseForm()
    // 창문 800~2000 / 두 번째 창문 1500~2700 → 겹침
    form.openings.push({ ...newOpening('window', 'w2'), offset: 1500 })
    expect(validateForm(form).map((e) => e.target)).toEqual(['w2'])
    // 2000~3200 → 맞닿음
    form.openings[2] = { ...form.openings[2], offset: 2000 }
    expect(validateForm(form)).toEqual([])
  })

  it('다른 벽이면 같은 거리여도 겹치지 않음', () => {
    const form = baseForm()
    form.openings.push({ ...newOpening('window', 'w2'), wall: 'E' })
    expect(validateForm(form)).toEqual([])
  })

  it('창문이 천장보다 높으면 오류 (900 + 1600 > 2400)', () => {
    const form = baseForm()
    form.openings[1] = { ...form.openings[1], height: 1600 }
    expect(validateForm(form).map((e) => e.target)).toEqual(['w1'])
  })

  it('5개부터는 오류', () => {
    const form = baseForm()
    form.width = 10000
    for (let i = 0; i < 3; i++) form.openings.push({ ...newOpening('window', `x${i}`), wall: 'W', offset: i * 1300 })
    expect(validateForm(form).map((e) => e.target)).toContain('openings')
  })
})
