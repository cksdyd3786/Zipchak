// M1-3 원룸 템플릿 선택: GET /templates 카드 3종 → 선택하면 M1-2 편집기로
import { useEffect, useState } from 'react'
import { fetchTemplates } from '../lib/api'
import { RoomScene } from '../scene/RoomScene'
import type { RoomData } from '../types/schema'
import { roomToForm } from './buildRoom'
import { RoomEditor } from './RoomEditor'

const PYEONG_M2 = 3.3058

/** 바닥 면적 (m²), 신발끈 공식 */
function floorAreaM2(room: RoomData) {
  const p = room.floorPolygon
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length]
    a += p[i].x * q.z - q.x * p[i].z
  }
  return Math.abs(a) / 2 / 1e6
}

/** 평면도 썸네일 (SVG): 바닥 + 문(주황)·창문(하늘) */
function Thumb({ room }: { room: RoomData }) {
  const xs = room.floorPolygon.map((p) => p.x)
  const zs = room.floorPolygon.map((p) => p.z)
  const w = Math.max(...xs)
  const d = Math.max(...zs)
  const pad = 200
  return (
    <svg viewBox={`${-pad} ${-pad} ${w + pad * 2} ${d + pad * 2}`} style={{ width: '100%', height: 140 }}>
      <polygon points={room.floorPolygon.map((p) => `${p.x},${p.z}`).join(' ')} fill="#d9c7a7" stroke="#eee" strokeWidth={80} />
      {room.openings.map((o) => {
        const wall = room.walls.find((x) => x.id === o.wallId)
        if (!wall) return null
        const len = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z)
        const ux = (wall.end.x - wall.start.x) / len
        const uz = (wall.end.z - wall.start.z) / len
        const a = { x: wall.start.x + ux * o.offset, z: wall.start.z + uz * o.offset }
        const b = { x: a.x + ux * o.width, z: a.z + uz * o.width }
        return (
          <line key={o.id} x1={a.x} y1={a.z} x2={b.x} y2={b.z} strokeWidth={160}
            stroke={o.type === 'door' ? '#ff9f43' : '#9fd3ff'} strokeLinecap="butt" />
        )
      })}
    </svg>
  )
}

const card = {
  width: 220, padding: 12, borderRadius: 10, background: '#26272d', border: '1px solid #3a3b42', color: '#eee', cursor: 'pointer', textAlign: 'left',
} as const

export function TemplatePicker({ onUseRoom }: { onUseRoom?: (room: RoomData) => void }) {
  const [templates, setTemplates] = useState<RoomData[] | null>(null)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<RoomData | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetchTemplates(ctrl.signal)
      .then(setTemplates)
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message))
    return () => ctrl.abort()
  }, [])

  // 고른 뒤: 직사각형이면 M1-2 편집기, ㄱ자 등은 안내 + 미리보기
  if (picked) {
    const back = <button style={{ ...card, width: 'auto', padding: '6px 12px' }} onClick={() => setPicked(null)}>← 템플릿 다시 고르기</button>
    if (roomToForm(picked)) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: 8, background: '#16171b' }}>{back}</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <RoomEditor key={picked.roomId} initialRoom={picked} onUseRoom={onUseRoom} />
          </div>
        </div>
      )
    }
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <RoomScene key={picked.roomId} room={picked} />
        <div style={{ position: 'absolute', left: 12, top: 12, padding: 12, borderRadius: 8, background: '#16171bdd', color: '#eee', fontFamily: 'sans-serif', fontSize: 13, maxWidth: 320 }}>
          {back}
          <div style={{ marginTop: 10, fontWeight: 700 }}>{picked.name}</div>
          <div style={{ marginTop: 6, color: '#ffd166' }}>
            ㄱ자·다각형 방은 치수 폼으로 편집할 수 없어요. 꼭짓점 편집은 준비 중이에요 (M1-4).
          </div>
          {onUseRoom && (
            <button style={{ ...card, width: '100%', marginTop: 10, background: '#2f6fed', textAlign: 'center' }} onClick={() => onUseRoom(picked)}>
              🪑 이 방 그대로 가구 배치 →
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, height: '100%', boxSizing: 'border-box', overflowY: 'auto', background: '#1e1f24', color: '#eee', fontFamily: 'sans-serif' }}>
      <h3 style={{ marginTop: 0 }}>원룸 템플릿으로 시작하기</h3>
      <div style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>비슷한 방을 고르고 치수만 고치세요</div>
      {error && <div style={{ color: '#ff6b6b' }}>템플릿을 불러오지 못했어요: {error}</div>}
      {!templates && !error && <div style={{ color: '#aaa' }}>불러오는 중…</div>}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {templates?.map((t) => {
          const m2 = floorAreaM2(t)
          return (
            <button key={t.roomId} style={card} onClick={() => setPicked(t)}>
              <Thumb room={t} />
              <div style={{ fontWeight: 700, marginTop: 8 }}>{t.name}</div>
              <div style={{ color: '#aaa', fontSize: 13, marginTop: 4 }}>
                약 {(m2 / PYEONG_M2).toFixed(1)}평 · {m2.toFixed(1)}m² · 천장 {t.ceilingHeight}mm
              </div>
              {!roomToForm(t) && <div style={{ color: '#ffd166', fontSize: 12, marginTop: 4 }}>ㄱ자 방 (보기·가구 배치만)</div>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
