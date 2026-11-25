import { describe, expect, it } from 'vitest'
import roomSample from '@schema/fixtures/room.sample.json'
import tpl4 from '@schema/fixtures/templates/tpl-4py-studio.json'
import tpl5 from '@schema/fixtures/templates/tpl-5py-studio.json'
import tpl6 from '@schema/fixtures/templates/tpl-6py-studio.json'
import { buildRoomFromForm, newOpening } from '../editor/buildRoom'
import { parseRoomJson } from './loadRoom'

describe('parseRoomJson', () => {
  it('room.sample.json(lidar)과 템플릿 3종이 열린다', () => {
    for (const r of [roomSample, tpl4, tpl5, tpl6]) {
      const res = parseRoomJson(JSON.stringify(r))
      expect(res.ok, JSON.stringify(res)).toBe(true)
    }
  })

  it('M1-2에서 저장한 파일도 열린다', () => {
    const room = buildRoomFromForm({ name: '내 방', width: 3000, depth: 4000, ceilingHeight: 2400, openings: [newOpening('door', 'a')] })
    expect(parseRoomJson(JSON.stringify(room)).ok).toBe(true)
  })

  it('JSON이 아니면 형식 오류', () => {
    const res = parseRoomJson('{ name: 방 }')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors[0]).toContain('JSON 형식이 아니에요')
  })

  it('필수 필드가 없으면 어떤 필드인지 알려준다', () => {
    const noWalls: Record<string, unknown> = { ...roomSample }
    delete noWalls.walls
    const res = parseRoomJson(JSON.stringify(noWalls))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.join('\n')).toContain("'walls' 필드가 없어요")
  })

  it('단위가 mm가 아니면 실패 (m로 내보낸 파일 방지)', () => {
    const res = parseRoomJson(JSON.stringify({ ...roomSample, unit: 'm' }))
    expect(res.ok).toBe(false)
  })

  it('가구 배치안(layout) 같은 다른 JSON을 열면 실패', () => {
    const res = parseRoomJson(JSON.stringify({ schemaVersion: '1.0', layoutId: 'lay_1', placements: [] }))
    expect(res.ok).toBe(false)
  })
})
