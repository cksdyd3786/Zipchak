// M1-2 자유 모드 편집 화면: 왼쪽 입력 폼 + 오른쪽 3D 미리보기
import { useMemo, useState } from 'react'
import { RoomScene } from '../scene/RoomScene'
import type { Facing, RoomData } from '../types/schema'
import {
  MAX_OPENINGS,
  WALL_LABEL,
  buildRoomFromForm,
  roomToForm,
  newOpening,
  validateForm,
  wallLength,
  type OpeningInput,
  type RoomForm,
  type WallSide,
} from './buildRoom'

const FACINGS: Exclude<Facing, null>[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const WALL_START: Record<WallSide, string> = {
  N: '왼쪽 위 모서리부터 →',
  E: '오른쪽 위 모서리부터 ↓',
  S: '오른쪽 아래 모서리부터 ←',
  W: '왼쪽 아래 모서리부터 ↑',
}

const s = {
  panel: { width: 340, padding: 16, overflowY: 'auto', background: '#16171b', color: '#eee', fontFamily: 'sans-serif', fontSize: 14 } as const,
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '6px 0' } as const,
  input: { width: 110, padding: 4, background: '#26272d', color: '#eee', border: '1px solid #444', borderRadius: 4 } as const,
  bad: { borderColor: '#ff5a5a' },
  card: { border: '1px solid #3a3b42', borderRadius: 8, padding: 10, margin: '10px 0' } as const,
  error: { color: '#ff6b6b', fontSize: 12, margin: '4px 0' } as const,
  btn: { padding: '6px 10px', marginRight: 6, background: '#33343b', color: '#eee', border: '1px solid #555', borderRadius: 6, cursor: 'pointer' } as const,
}

function NumberField(props: { label: string; value: number; onChange: (v: number) => void; bad?: boolean }) {
  return (
    <label style={s.row}>
      <span>{props.label}</span>
      <input
        type="number"
        step={10}
        value={Number.isNaN(props.value) ? '' : props.value}
        onChange={(e) => props.onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        style={{ ...s.input, ...(props.bad ? s.bad : {}) }}
      />
    </label>
  )
}

const DEFAULT_FORM: RoomForm = {
  name: '내 방',
  width: 3200,
  depth: 4800,
  ceilingHeight: 2400,
  openings: [newOpening('door', 'o1'), newOpening('window', 'o2')],
}

export interface RoomEditorProps {
  onSave?: (room: RoomData) => void
  /** 템플릿 등에서 시작할 방 (M1-3). source·sourceMeta를 이어받는다 */
  initialRoom?: RoomData
  /** [이 방에서 가구 배치] 버튼 */
  onUseRoom?: (room: RoomData) => void
}

export function RoomEditor({ onSave, initialRoom, onUseRoom }: RoomEditorProps) {
  const [form, setForm] = useState<RoomForm>(() => (initialRoom && roomToForm(initialRoom)) || DEFAULT_FORM)
  const [nextKey, setNextKey] = useState(3)

  const errors = useMemo(() => validateForm(form), [form])
  const errorFor = (target: string) => errors.filter((e) => e.target === target)

  // 미리보기: 방 크기가 정상일 때만 새로 만든다 (잘못된 값이면 직전 모양 유지)
  const sizeOk = !errors.some((e) => ['width', 'depth', 'ceilingHeight'].includes(e.target))
  const [preview, setPreview] = useState<RoomData>(() => buildRoomFromForm(form, { base: initialRoom }))
  const [prevForm, setPrevForm] = useState(form)
  if (prevForm !== form) {
    setPrevForm(form)
    if (sizeOk) setPreview(buildRoomFromForm(form, { roomId: preview.roomId, base: initialRoom }))
  }

  const update = (patch: Partial<RoomForm>) => setForm((f) => ({ ...f, ...patch }))
  const updateOpening = (key: string, patch: Partial<OpeningInput>) =>
    setForm((f) => ({ ...f, openings: f.openings.map((o) => (o.key === key ? { ...o, ...patch } : o)) }))
  const addOpening = (type: 'door' | 'window') => {
    setForm((f) => ({ ...f, openings: [...f.openings, newOpening(type, `o${nextKey}`)] }))
    setNextKey((k) => k + 1)
  }
  const removeOpening = (key: string) => setForm((f) => ({ ...f, openings: f.openings.filter((o) => o.key !== key) }))

  const save = () => {
    const room = buildRoomFromForm(form, { roomId: preview.roomId, base: initialRoom })
    if (onSave) onSave(room)
    else {
      // API 연결 전: JSON 파일로 내려받기
      const blob = new Blob([JSON.stringify(room, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${room.roomId}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    }
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <div style={s.panel}>
        <h3 style={{ marginTop: 0 }}>치수로 방 만들기</h3>
        {initialRoom?.source === 'template' && (
          <div style={{ color: '#9fc3ff', fontSize: 12, marginBottom: 8 }}>템플릿에서 시작: {initialRoom.name}</div>
        )}
        <label style={s.row}>
          <span>방 이름</span>
          <input value={form.name} maxLength={40} onChange={(e) => update({ name: e.target.value })} style={s.input} />
        </label>
        <NumberField label="가로 (mm)" value={form.width} onChange={(v) => update({ width: v })} bad={errorFor('width').length > 0} />
        <NumberField label="세로 (mm)" value={form.depth} onChange={(v) => update({ depth: v })} bad={errorFor('depth').length > 0} />
        <NumberField label="천장 높이 (mm)" value={form.ceilingHeight} onChange={(v) => update({ ceilingHeight: v })} bad={errorFor('ceilingHeight').length > 0} />
        {['width', 'depth', 'ceilingHeight'].flatMap(errorFor).map((e, i) => (
          <div key={i} style={s.error}>{e.message}</div>
        ))}

        <h4>문·창문 ({form.openings.length}/{MAX_OPENINGS})</h4>
        {form.openings.map((o) => {
          const errs = errorFor(o.key)
          return (
            <div key={o.key} style={{ ...s.card, ...(errs.length ? { borderColor: '#ff5a5a' } : {}) }}>
              <div style={s.row}>
                <b>{o.type === 'door' ? '🚪 문' : '🪟 창문'}</b>
                <button style={s.btn} onClick={() => removeOpening(o.key)}>삭제</button>
              </div>
              <label style={s.row}>
                <span>벽</span>
                <select value={o.wall} onChange={(e) => updateOpening(o.key, { wall: e.target.value as WallSide })} style={s.input}>
                  {(Object.keys(WALL_LABEL) as WallSide[]).map((w) => (
                    <option key={w} value={w}>{WALL_LABEL[w]} ({wallLength(form, w)}mm)</option>
                  ))}
                </select>
              </label>
              <div style={{ fontSize: 12, color: '#999' }}>거리는 {WALL_START[o.wall]}</div>
              <NumberField label="거리 (mm)" value={o.offset} onChange={(v) => updateOpening(o.key, { offset: v })} />
              <NumberField label="폭 (mm)" value={o.width} onChange={(v) => updateOpening(o.key, { width: v })} />
              <NumberField label="높이 (mm)" value={o.height} onChange={(v) => updateOpening(o.key, { height: v })} />
              {o.type === 'window' ? (
                <>
                  <NumberField label="하단 높이 (mm)" value={o.sillHeight} onChange={(v) => updateOpening(o.key, { sillHeight: v })} />
                  <label style={s.row}>
                    <span>방위</span>
                    <select
                      value={o.facing ?? ''}
                      onChange={(e) => updateOpening(o.key, { facing: (e.target.value || null) as Facing })}
                      style={s.input}
                    >
                      <option value="">모름</option>
                      {FACINGS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label style={s.row}>
                    <span>경첩</span>
                    <select value={o.hingeSide} onChange={(e) => updateOpening(o.key, { hingeSide: e.target.value as 'left' | 'right' })} style={s.input}>
                      <option value="left">왼쪽</option>
                      <option value="right">오른쪽</option>
                    </select>
                  </label>
                  <label style={s.row}>
                    <span>열림 방향</span>
                    <select value={o.opensInward ? 'in' : 'out'} onChange={(e) => updateOpening(o.key, { opensInward: e.target.value === 'in' })} style={s.input}>
                      <option value="in">방 안쪽</option>
                      <option value="out">방 바깥쪽</option>
                    </select>
                  </label>
                </>
              )}
              {errs.map((e, i) => <div key={i} style={s.error}>{e.message}</div>)}
            </div>
          )
        })}
        <div>
          <button style={s.btn} disabled={form.openings.length >= MAX_OPENINGS} onClick={() => addOpening('door')}>+ 문</button>
          <button style={s.btn} disabled={form.openings.length >= MAX_OPENINGS} onClick={() => addOpening('window')}>+ 창문</button>
        </div>
        {errorFor('openings').map((e, i) => <div key={i} style={s.error}>{e.message}</div>)}

        <hr style={{ borderColor: '#333', margin: '16px 0' }} />
        <button
          style={{ ...s.btn, width: '100%', padding: 10, background: errors.length ? '#3a2a2a' : '#2f6fed', cursor: errors.length ? 'not-allowed' : 'pointer' }}
          disabled={errors.length > 0}
          onClick={save}
        >
          {errors.length ? `저장 불가 (오류 ${errors.length}개)` : '저장'}
        </button>
        {onUseRoom && (
          <button
            style={{ ...s.btn, width: '100%', padding: 10, marginTop: 8 }}
            disabled={errors.length > 0}
            onClick={() => onUseRoom(buildRoomFromForm(form, { roomId: preview.roomId, base: initialRoom }))}
          >
            🪑 이 방에서 가구 배치 →
          </button>
        )}
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <RoomScene room={preview} />
      </div>
    </div>
  )
}
