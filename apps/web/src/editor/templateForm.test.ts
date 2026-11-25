import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import roomSchema from '@schema/room.schema.json'
import tpl4 from '@schema/fixtures/templates/tpl-4py-studio.json'
import tpl5 from '@schema/fixtures/templates/tpl-5py-studio.json'
import tpl6 from '@schema/fixtures/templates/tpl-6py-studio.json'
import type { RoomData } from '../types/schema'
import { buildRoomFromForm, roomToForm, validateForm } from './buildRoom'

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(roomSchema)

describe('M1-3 템플릿 → 편집 폼 → 저장', () => {
  for (const [name, t] of [['4평', tpl4], ['5평', tpl5]] as const) {
    const tpl = t as RoomData

    it(`${name}: 폼으로 바뀌고 입력 오류가 없다`, () => {
      const form = roomToForm(tpl)!
      expect(form).not.toBeNull()
      expect(validateForm(form)).toEqual([])
    })

    it(`${name}: 그대로 저장하면 source: template·templateId 유지, 스키마 통과`, () => {
      const room = buildRoomFromForm(roomToForm(tpl)!, { base: tpl })
      validate(room)
      expect(validate.errors ?? []).toEqual([])
      expect(room.source).toBe('template')
      expect(room.sourceMeta?.templateId).toBe(tpl.sourceMeta?.templateId)
      expect(room.roomId).toBe(tpl.roomId)
    })

    it(`${name}: 문·창문 위치(벽·offset·폭)가 원본과 같다`, () => {
      const room = buildRoomFromForm(roomToForm(tpl)!, { base: tpl })
      const pick = (r: RoomData) => r.openings.map((o) => [o.type, o.wallId, o.offset, o.width, o.sillHeight]).sort()
      expect(pick(room)).toEqual(pick(tpl))
    })

    it(`${name}: 치수를 고쳐도 source는 template`, () => {
      const form = { ...roomToForm(tpl)!, width: tpl.floorPolygon[1].x + 200 }
      expect(buildRoomFromForm(form, { base: tpl }).source).toBe('template')
    })
  }

  it('6평 ㄱ자는 직사각 폼으로 못 바꾼다 → null (꼭짓점 편집 M1-4)', () => {
    expect(roomToForm(tpl6 as RoomData)).toBeNull()
  })

  it('base 없이 저장하면 지금처럼 source: manual', () => {
    const room = buildRoomFromForm(roomToForm(tpl4 as RoomData)!)
    expect(room.source).toBe('manual')
  })
})
