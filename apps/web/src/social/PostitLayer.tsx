import { Canvas, type ThreeEvent } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { toPostitAnchor } from './postitAnchor'

type SurfaceProps = {
  type: 'wall' | 'furniture'
  id: string
  position?: [number, number, number]
  rotationY?: number
  children: ReactNode
}

export function PostitLayer({ type, id, position, rotationY, children }: SurfaceProps) {
  function reportClick(event: ThreeEvent<MouseEvent>) {
    if (!event.face || event.delta > 4) return
    event.stopPropagation()

    const target = type === 'wall'
      ? { type, id }
      : { type, id, frame: event.eventObject }

    const anchor = toPostitAnchor(event.object, event.point, event.face.normal, target)
    console.log('postit anchor', anchor)
  }

  return (
    <group position={position} rotation-y={rotationY} onClick={reportClick}>
      {children}
    </group>
  )
}

export default function PostitPrototype() {
  return (
    <main style={{ padding: 16 }}>
      <h1>포스트잇 위치 테스트</h1>
      <p>회색 벽이나 파란 가구를 누르고 개발자 도구의 Console을 확인하세요.</p>
      <div style={{ height: '65vh' }}>
        <Canvas camera={{ position: [3, 2.5, 4], fov: 40 }}>
          <color attach="background" args={['#eef2f7']} />
          <ambientLight intensity={1.3} />
          <directionalLight position={[2, 4, 3]} intensity={2} />
          <PostitLayer type="wall" id="wall_test" position={[0, 1, -0.9]}>
            <mesh>
              <boxGeometry args={[2.8, 2, 0.12]} />
              <meshStandardMaterial color="#a6aab2" />
            </mesh>
          </PostitLayer>
          <PostitLayer type="furniture" id="inst_test" position={[0.45, 0, 0.35]} rotationY={Math.PI / 2}>
            <mesh position={[0, 0.35, 0]}>
              <boxGeometry args={[0.9, 0.7, 0.6]} />
              <meshStandardMaterial color="#2874bd" />
            </mesh>
          </PostitLayer>
          <mesh rotation-x={-Math.PI / 2}>
            <planeGeometry args={[3.4, 2.8]} />
            <meshStandardMaterial color="#d0c0a6" />
          </mesh>
        </Canvas>
      </div>
    </main>
  )
}
