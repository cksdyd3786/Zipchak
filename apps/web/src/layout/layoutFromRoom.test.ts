import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import layoutSchema from '@schema/furniture-layout.schema.json'
import roomSample from '@schema/fixtures/room.sample.json'
import tpl4 from '@schema/fixtures/templates/tpl-4py-studio.json'
import type { RoomData } from '../types/schema'
import { layoutFromRoom, newPlacement } from './layoutFromRoom'

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(layoutSchema)
const room = roomSample as RoomData

describe('layoutFromRoom', () => {
  it('결과가 furniture-layout.schema.json을 통과한다', () => {
    const layout = layoutFromRoom(room, new Date('2026-11-25T00:00:00Z'))
    validate(layout)
    expect(validate.errors ?? []).toEqual([])
  })

  it('기존 가구가 placements로 옮겨지고, movable=false면 locked', () => {
    const layout = layoutFromRoom(room)
    expect(layout.placements).toHaveLength(room.existingFurniture.length)
    room.existingFurniture.forEach((f, i) => {
      expect(layout.placements[i]).toMatchObject({
        instanceId: f.instanceId, source: 'existing', position: f.position, rotationDeg: f.rotationDeg, locked: !f.movable,
      })
    })
  })

  it('가구 없는 템플릿 방이면 빈 배치안', () => {
    expect(layoutFromRoom(tpl4 as RoomData).placements).toEqual([])
  })
})

describe('newPlacement', () => {
  it('방 중심(3200×4800 → 1600, 2400)에 회전 0으로 놓는다', () => {
    const p = newPlacement(room, 'desk', { width: 1200, depth: 600, height: 730 }, 1)
    expect(p).toMatchObject({ position: { x: 1600, z: 2400 }, rotationDeg: 0, source: 'custom', locked: false })
  })
})
