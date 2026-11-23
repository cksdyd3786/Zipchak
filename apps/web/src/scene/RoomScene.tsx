import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { mmToM } from '../lib/units'
import type { FurnitureLayout, RoomData } from '../types/schema'
import { Fixtures } from './Fixtures'
import { Floor } from './Floor'
import { Furniture } from './Furniture'
import { Openings } from './Openings'
import { Walls } from './Walls'

export interface RoomSceneProps {
  room: RoomData
  /** 있으면 배치안의 placements를, 없으면 방의 existingFurniture를 그린다. */
  layout?: FurnitureLayout | null
}

/** B·C 공용 진입점. props 모양을 바꿀 때는 C와 서로 PR 리뷰. */
export function RoomScene({ room, layout }: RoomSceneProps) {
  // 바닥 다각형 바운딩 박스 중심 (mm)
  const center = useMemo(() => {
    const xs = room.floorPolygon.map((p) => p.x)
    const zs = room.floorPolygon.map((p) => p.z)
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
      size: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)),
    }
  }, [room.floorPolygon])

  const items = layout ? layout.placements : room.existingFurniture
  const target: [number, number, number] = [mmToM(center.x), 0, mmToM(center.z)]
  const dist = mmToM(center.size) * 1.2
  // 쿼터뷰: 방 중심에서 남동쪽 위
  const cameraPos: [number, number, number] = [target[0] + dist * 0.8, dist * 1.3, target[2] + dist]

  return (
    <Canvas shadows="percentage" dpr={[1, 2]} camera={{ position: cameraPos, fov: 45, near: 0.05, far: 100 }}>
      <color attach="background" args={['#1e1f24']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[target[0] + 3, 6, target[2] + 4]} intensity={1.2} castShadow />

      <Floor polygon={room.floorPolygon} />
      <Walls walls={room.walls} openings={room.openings} center={center} />
      <Openings walls={room.walls} openings={room.openings} />
      <Fixtures fixtures={room.fixtures} />
      <Furniture items={items} />

      <OrbitControls target={target} maxPolarAngle={Math.PI / 2 - 0.05} makeDefault />
    </Canvas>
  )
}
