import roomSample from '@schema/fixtures/room.sample.json'
import { RoomScene } from './scene/RoomScene'
import type { RoomData } from './types/schema'

// M4-1: 서버 없이 fixture 방을 바로 렌더한다. API 연결은 이후 단계에서 src/lib/api.ts로.
const room = roomSample as RoomData

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div style={{ position: 'absolute', zIndex: 1, top: 12, left: 16, color: '#eee', fontFamily: 'sans-serif' }}>
        {room.name}
      </div>
      <RoomScene room={room} />
    </div>
  )
}
