// 방 JSON 파일 열기: 버튼 또는 드래그 앤 드롭 → 스키마 검증 → 3D로 보기
import { useRef, useState, type DragEvent } from 'react'
import { loadRoomFile } from '../lib/loadRoom'
import { RoomScene } from '../scene/RoomScene'
import type { RoomData } from '../types/schema'

const SOURCE_LABEL: Record<RoomData['source'], string> = {
  lidar: '아이폰 스캔',
  manual: '치수 입력',
  template: '템플릿',
  floorplan: '평면도',
}

const btn = {
  padding: '8px 14px', background: '#2f6fed', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
} as const

function roomSize(room: RoomData) {
  const xs = room.floorPolygon.map((p) => p.x)
  const zs = room.floorPolygon.map((p) => p.z)
  const w = Math.max(...xs) - Math.min(...xs)
  const d = Math.max(...zs) - Math.min(...zs)
  return `${(w / 1000).toFixed(2)} × ${(d / 1000).toFixed(2)} m`
}

export interface RoomFileViewerProps {
  /** 방을 열면 알려 준다 (App이 [가구 배치] 탭에 같은 방을 넘김) */
  onRoomLoaded?: (room: RoomData) => void
  /** [이 방에서 가구 배치] 버튼 */
  onEditFurniture?: () => void
  /** 탭을 오갔을 때 다시 보여 줄 방 */
  initialRoom?: RoomData | null
}

export function RoomFileViewer({ onRoomLoaded, onEditFurniture, initialRoom = null }: RoomFileViewerProps = {}) {
  const input = useRef<HTMLInputElement>(null)
  const [room, setRoom] = useState<RoomData | null>(initialRoom)
  const [fileName, setFileName] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)

  const open = async (file: File | undefined) => {
    if (!file) return
    const res = await loadRoomFile(file)
    setFileName(file.name)
    if (res.ok) {
      setRoom(res.room)
      onRoomLoaded?.(res.room)
      setErrors([])
    } else {
      setErrors(res.errors)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    void open(e.dataTransfer.files[0])
  }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', background: '#1e1f24', fontFamily: 'sans-serif' }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {room ? (
        // key: 다른 방을 열면 카메라를 새 방 크기에 맞춰 다시 잡는다
        <RoomScene key={room.roomId + fileName} room={room} />
      ) : (
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 15 }}>
          방 JSON 파일을 열거나 여기로 끌어다 놓으세요
        </div>
      )}

      {/* 왼쪽 위: 열기 버튼 + 방 정보 + 오류 */}
      <div style={{ position: 'absolute', left: 12, top: 12, maxWidth: 380, padding: 12, borderRadius: 8, background: '#16171bdd', color: '#eee', fontSize: 13 }}>
        <button style={btn} onClick={() => input.current?.click()}>📂 방 JSON 파일 열기</button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            void open(e.target.files?.[0])
            e.target.value = '' // 같은 파일을 다시 골라도 열리게
          }}
        />
        {room && (
          <div style={{ marginTop: 10, lineHeight: 1.6 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{room.name}</div>
            <div>{SOURCE_LABEL[room.source]} · {roomSize(room)} · 천장 {room.ceilingHeight}mm</div>
            <div style={{ color: '#aaa' }}>
              벽 {room.walls.length} · 문·창 {room.openings.length} · 고정물 {room.fixtures.length} · 가구 {room.existingFurniture.length}
            </div>
            <div style={{ color: '#777' }}>{fileName}</div>
            {onEditFurniture && (
              <button style={{ ...btn, marginTop: 8, background: '#33343b', border: '1px solid #555' }} onClick={onEditFurniture}>
                🪑 이 방에서 가구 배치 →
              </button>
            )}
          </div>
        )}
        {errors.length > 0 && (
          <div style={{ marginTop: 10, color: '#ff6b6b' }}>
            <b>{fileName} 을(를) 열 수 없어요</b>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
      </div>

      {dragOver && (
        <div style={{ position: 'absolute', inset: 0, border: '3px dashed #2f6fed', background: '#2f6fed22', pointerEvents: 'none' }} />
      )}
    </div>
  )
}
