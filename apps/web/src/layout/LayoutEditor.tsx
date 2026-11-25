// M4-2 가구 직접 편집 화면: 드래그(50mm 스냅)·90° 회전·삭제, 충돌 빨간색, 놓으면 점수 재계산
import { useEffect, useMemo, useState } from 'react'
import { validateLayout, type ValidateResult } from '../lib/api'
import { RoomScene } from '../scene/RoomScene'
import { useLayoutStore } from '../store/layoutStore'
import type { FurnitureLayout, RoomData } from '../types/schema'
import { findViolations } from './collision'
import { EditableFurniture } from './EditableFurniture'
import { QUICK_FURNITURE, newPlacement } from './layoutFromRoom'

const VALIDATE_DEBOUNCE_MS = 500

const btn = { padding: '8px 12px', marginRight: 6, background: '#33343b', color: '#eee', border: '1px solid #555', borderRadius: 6, cursor: 'pointer', fontSize: 14 } as const

export function LayoutEditor({ room, initialLayout, onSave }: { room: RoomData; initialLayout: FurnitureLayout; onSave?: (l: FurnitureLayout) => void }) {
  const { layout, selectedId, draggingId, setLayout, rotate, remove, add } = useLayoutStore()
  const [seq, setSeq] = useState(1)

  useEffect(() => setLayout(initialLayout), [initialLayout, setLayout])

  // 클라이언트 즉시 충돌 판정
  const violations = useMemo(() => (layout ? findViolations(room, layout.placements) : []), [room, layout])
  const badIds = useMemo(() => new Set(violations.map((v) => v.instanceId)), [violations])

  // 놓은 뒤 500ms 디바운스로 validate (드래그 중에는 부르지 않음)
  const [result, setResult] = useState<ValidateResult | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!layout || draggingId) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      validateLayout(room, layout, ctrl.signal)
        .then(setResult)
        .catch(() => {})
        .finally(() => setLoading(false))
    }, VALIDATE_DEBOUNCE_MS)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [room, layout, draggingId])

  if (!layout) return null
  const selected = layout.placements.find((p) => p.instanceId === selectedId)
  const canSave = violations.length === 0

  const save = () => {
    if (onSave) return onSave(layout)
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${layout.layoutId}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <RoomScene
        room={room}
        layout={layout}
        furniture={<EditableFurniture placements={layout.placements} badIds={badIds} />}
      />

      {/* 왼쪽 위: 점수·위반 */}
      <div style={{ position: 'absolute', left: 12, top: 12, width: 260, padding: 12, borderRadius: 8, background: '#16171bdd', color: '#eee', fontFamily: 'sans-serif', fontSize: 13 }}>
        <div style={{ color: '#aaa', marginBottom: 4 }}>{room.name}</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          점수 {result?.analysis?.score ?? '–'} {loading && <span style={{ fontSize: 12, color: '#aaa' }}>계산 중…</span>}
        </div>
        {violations.length > 0 ? (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#ff6b6b' }}>
            {violations.map((v, i) => (
              <li key={i}>{layout.placements.find((p) => p.instanceId === v.instanceId)?.category ?? v.instanceId}: {v.message}</li>
            ))}
          </ul>
        ) : (
          <div style={{ marginTop: 6, color: '#8fd19e' }}>충돌 없음</div>
        )}
        {result?.analysis?.reasons?.map((r, i) => <div key={i} style={{ marginTop: 4, color: '#aaa' }}>{r}</div>)}
        <div style={{ marginTop: 8, color: '#888' }}>
          {layout.placements.length === 0 ? '이 방에는 가구가 없어요. 아래에서 추가하세요' : '가구를 끌어서 옮기세요 (50mm 단위)'}
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {QUICK_FURNITURE.map((q) => (
            <button
              key={q.category}
              style={{ ...btn, marginRight: 0, padding: '4px 8px', fontSize: 12 }}
              onClick={() => {
                add(newPlacement(room, q.category, q.dimensions, seq))
                setSeq((n) => n + 1)
              }}
            >
              + {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* 아래: 선택한 가구 도구 + 저장 */}
      <div style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', padding: 8, borderRadius: 10, background: '#16171bdd' }}>
        {selected ? (
          <>
            <span style={{ color: '#eee', marginRight: 10, fontFamily: 'sans-serif' }}>{selected.category}{selected.locked ? ' (고정)' : ''}</span>
            <button style={btn} disabled={selected.locked} onClick={() => rotate(selected.instanceId)}>⟳ 90° 회전</button>
            <button style={btn} disabled={selected.locked} onClick={() => remove(selected.instanceId)}>🗑 삭제</button>
          </>
        ) : (
          <span style={{ color: '#aaa', marginRight: 10, fontFamily: 'sans-serif' }}>가구를 눌러 선택</span>
        )}
        <button
          style={{ ...btn, background: canSave ? '#2f6fed' : '#3a2a2a', cursor: canSave ? 'pointer' : 'not-allowed' }}
          disabled={!canSave}
          onClick={save}
        >
          {canSave ? '저장' : '충돌 해결 후 저장'}
        </button>
      </div>
    </div>
  )
}
