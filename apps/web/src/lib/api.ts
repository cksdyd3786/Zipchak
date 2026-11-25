// REST 클라이언트. VITE_API_URL이 없으면 Mock으로 동작한다 (E의 API 서버가 붙기 전까지).
import { findViolations, type Violation } from '../layout/collision'
import type { FurnitureLayout, RoomData } from '../types/schema'

const API_URL = import.meta.env.VITE_API_URL as string | undefined

export interface ValidateResult {
  violations: Violation[]
  analysis: { score: number; scoreBreakdown?: Record<string, number>; reasons?: string[] } | null
}

/** POST /layouts/:layoutId/validate → { violations, analysis } (docs/api.md) */
export async function validateLayout(room: RoomData, layout: FurnitureLayout, signal?: AbortSignal): Promise<ValidateResult> {
  if (API_URL) {
    const res = await fetch(`${API_URL}/layouts/${layout.layoutId}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
      signal,
    })
    if (!res.ok) throw new Error(`validate 실패: ${res.status}`)
    return res.json()
  }
  // Mock: 클라이언트 충돌 판정으로 위반을 만들고, 점수는 위반 수로 대충 깎는다 (실제 점수는 D의 엔진)
  await new Promise((r) => setTimeout(r, 150))
  const violations = findViolations(room, layout.placements)
  const ids = new Set(violations.map((v) => v.instanceId))
  return { violations, analysis: { score: Math.max(0, 90 - ids.size * 15), reasons: ['(Mock 점수: 엔진 연결 전)'] } }
}

/** GET /templates → RoomData[] (M1-3). API가 없으면 fixture 3종 */
export async function fetchTemplates(signal?: AbortSignal): Promise<RoomData[]> {
  if (API_URL) {
    const res = await fetch(`${API_URL}/templates`, { signal })
    if (!res.ok) throw new Error(`templates 실패: ${res.status}`)
    return res.json()
  }
  const [t4, t5, t6] = await Promise.all([
    import('@schema/fixtures/templates/tpl-4py-studio.json'),
    import('@schema/fixtures/templates/tpl-5py-studio.json'),
    import('@schema/fixtures/templates/tpl-6py-studio.json'),
  ])
  return [t4.default, t5.default, t6.default] as RoomData[]
}
