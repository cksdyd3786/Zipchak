// 방 JSON 파일 읽기: 파싱 → room.schema.json 검증 → RoomData
// 아이폰 스캔(source: lidar) 파일, 템플릿, M1-2에서 저장한 파일 모두 같은 경로로 연다.
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import roomSchema from '@schema/room.schema.json'
import type { RoomData } from '../types/schema'

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile<RoomData>(roomSchema)

export type LoadResult = { ok: true; room: RoomData } | { ok: false; errors: string[] }

/** ajv 오류를 사람이 읽을 문장으로 (최대 10개) */
function describe(errors: ErrorObject[]): string[] {
  return errors.slice(0, 10).map((e) => {
    const where = e.instancePath || '(최상위)'
    switch (e.keyword) {
      case 'required':
        return `${where}: '${(e.params as { missingProperty: string }).missingProperty}' 필드가 없어요`
      case 'type':
        return `${where}: ${(e.params as { type: string }).type} 형식이어야 해요`
      case 'enum':
      case 'const':
        return `${where}: 허용되지 않는 값이에요 (${e.message})`
      case 'minimum':
      case 'maximum':
        return `${where}: 범위를 벗어났어요 (${e.message})`
      case 'additionalProperties':
        return `${where}: 스키마에 없는 필드 '${(e.params as { additionalProperty: string }).additionalProperty}'`
      default:
        return `${where}: ${e.message}`
    }
  })
}

/** 문자열 → RoomData (검증 실패 시 이유 목록) */
export function parseRoomJson(text: string): LoadResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    return { ok: false, errors: [`JSON 형식이 아니에요: ${(e as Error).message}`] }
  }
  if (!validate(data)) {
    const errors = describe(validate.errors ?? [])
    const extra = (validate.errors?.length ?? 0) > 10 ? [`…외 ${validate.errors!.length - 10}개`] : []
    return { ok: false, errors: ['room.schema.json 검증 실패', ...errors, ...extra] }
  }
  return { ok: true, room: data }
}

/** File(파일 선택·드래그) → RoomData */
export async function loadRoomFile(file: File): Promise<LoadResult> {
  if (file.size > 5 * 1024 * 1024) return { ok: false, errors: ['파일이 너무 커요 (5MB 초과)'] }
  return parseRoomJson(await file.text())
}
