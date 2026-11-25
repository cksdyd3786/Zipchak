import layoutSample from '@schema/fixtures/layout.sample.json'
import roomSample from '@schema/fixtures/room.sample.json'
import { useState } from 'react'
import { RoomEditor } from './editor/RoomEditor'
import { LayoutEditor } from './layout/LayoutEditor'
import { RoomScene } from './scene/RoomScene'
import { RoomFileViewer } from './viewer/RoomFileViewer'
import type { FurnitureLayout, RoomData } from './types/schema'

const sampleRoom = roomSample as RoomData
const sampleLayout = layoutSample as unknown as FurnitureLayout

type Mode = 'open' | 'editor' | 'layout' | 'sample'

export default function App() {
  const [mode, setMode] = useState<Mode>('open')
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
        {tab('editor', '치수로 만들기 (M1-2)')}
        {tab('layout', '가구 배치 (M4-2)')}
        {tab('sample', '샘플 방 보기')}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === 'open' && <RoomFileViewer />}
        {mode === 'editor' && <RoomEditor />}
        {mode === 'layout' && <LayoutEditor room={sampleRoom} initialLayout={sampleLayout} />}
        {mode === 'sample' && <RoomScene room={sampleRoom} />}
      </div>
    </div>
  )
}
