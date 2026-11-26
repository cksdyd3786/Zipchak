import layoutSample from '@schema/fixtures/layout.sample.json'
import roomSample from '@schema/fixtures/room.sample.json'
import { useMemo, useState } from 'react'
import { RoomEditor } from './editor/RoomEditor'
import { TemplatePicker } from './editor/TemplatePicker'
import { LayoutEditor } from './layout/LayoutEditor'
import { layoutFromRoom } from './layout/layoutFromRoom'
import { RoomScene } from './scene/RoomScene'
import { PostitRoom } from './social/PostitLayer'
import { RoomFileViewer } from './viewer/RoomFileViewer'
import type { FurnitureLayout, RoomData } from './types/schema'

const sampleRoom = roomSample as RoomData
const sampleLayout = layoutSample as unknown as FurnitureLayout

type Mode = 'open' | 'template' | 'editor' | 'layout' | 'sample' | 'postit'

export default function App() {
  const [mode, setMode] = useState<Mode>('open')
  // [가구 배치] 탭에서 편집할 방: [파일 열기]로 연 방, 아직 없으면 샘플 방
  const [currentRoom, setCurrentRoom] = useState<RoomData>(sampleRoom)
  const currentLayout = useMemo(
    () => (currentRoom === sampleRoom ? sampleLayout : layoutFromRoom(currentRoom)),
    [currentRoom],
  )
  // 편집기·템플릿에서 [가구 배치]를 누르면 그 방으로 배치 화면 열기
  const openInLayout = (room: RoomData) => {
    setCurrentRoom(room)
    setMode('layout')
  }
  const tab = (m: Mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      style={{
        padding: '6px 12px', marginRight: 6, borderRadius: 6, border: '1px solid #555', cursor: 'pointer',
        background: mode === m ? '#2f6fed' : '#26272d', color: '#eee',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
      <div style={{ padding: 8, background: '#101114' }}>
        {tab('open', '파일 열기')}
        {tab('template', '템플릿 (M1-3)')}
        {tab('editor', '치수로 만들기 (M1-2)')}
        {tab('layout', '가구 배치 (M4-2)')}
        {tab('sample', '샘플 방 보기')}
        {tab('postit', '포스트잇')}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === 'open' && <RoomFileViewer initialRoom={currentRoom === sampleRoom ? null : currentRoom} onRoomLoaded={setCurrentRoom} onEditFurniture={() => setMode('layout')} />}
        {mode === 'template' && <TemplatePicker onUseRoom={openInLayout} />}
        {mode === 'editor' && <RoomEditor onUseRoom={openInLayout} />}
        {mode === 'layout' && <LayoutEditor key={currentRoom.roomId} room={currentRoom} initialLayout={currentLayout} />}
        {mode === 'sample' && <RoomScene room={sampleRoom} />}
        {mode === 'postit' && <PostitRoom room={currentRoom} layout={currentLayout} />}
      </div>
    </div>
  )
}
