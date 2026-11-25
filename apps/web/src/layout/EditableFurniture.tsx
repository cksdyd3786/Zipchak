// M4-2 드래그·선택 가능한 가구. 충돌이면 빨간색.
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { degToRad, mmToM, mToMm } from '../lib/units'
import { useLayoutStore } from '../store/layoutStore'
import type { Placement } from '../types/schema'

const COLOR: Record<string, string> = {
  bed: '#7fa7d9', desk: '#c79a6b', chair: '#e0b15c', storage: '#9c8cc9', shelf: '#a3b18a', table: '#d08c60',
  wardrobe: '#8d7b68', sofa: '#d77a8f', lamp: '#f2d16b', decor: '#8fc9b9', etc: '#b0b0b0',
}
const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

/** CameraControls·OrbitControls 공통: enabled 속성만 쓴다 */
type Controls = { enabled: boolean } | null

function Item({ p, bad }: { p: Placement; bad: boolean }) {
  const { selectedId, select, move, setDragging } = useLayoutStore()
  // 이벤트 안에서 현재 카메라 컨트롤을 꺼내 쓴다 (렌더 중 값 수정 금지 규칙)
  const getState = useThree((s) => s.get)
  const setControls = (enabled: boolean) => {
    const c = getState().controls as unknown as Controls
    if (c) c.enabled = enabled
  }
  // 잡은 지점과 가구 중심의 차이 (m)
  const grab = useRef<{ dx: number; dz: number } | null>(null)

  const { width, depth, height } = p.dimensions
  const selected = selectedId === p.instanceId
  const color = bad ? '#ff4d4f' : selected ? '#ffd166' : (COLOR[p.category] ?? COLOR.etc)

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    select(p.instanceId)
    if (p.locked) return
    const hit = e.ray.intersectPlane(FLOOR, new THREE.Vector3())
    if (!hit) return
    grab.current = { dx: hit.x - mmToM(p.position.x), dz: hit.z - mmToM(p.position.z) }
    setControls(false) // 드래그 중 카메라 고정
    setDragging(p.instanceId)
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const hit = grab.current && e.ray.intersectPlane(FLOOR, new THREE.Vector3())
    if (!grab.current || !hit) return
    move(p.instanceId, mToMm(hit.x - grab.current.dx), mToMm(hit.z - grab.current.dz))
  }
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (!grab.current) return
    grab.current = null
    setControls(true)
    setDragging(null)
    ;(e.target as Element).releasePointerCapture(e.pointerId)
  }

  return (
    <group position={[mmToM(p.position.x), 0, mmToM(p.position.z)]} rotation-y={degToRad(p.rotationDeg)}>
      <mesh
        position={[0, mmToM(height / 2), 0]}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        castShadow
      >
        <boxGeometry args={[mmToM(width), mmToM(height), mmToM(depth)]} />
        <meshStandardMaterial color={color} transparent={bad} opacity={bad ? 0.85 : 1} />
      </mesh>
      {/* 정면(+Z) 표시 */}
      <mesh position={[0, mmToM(height / 2), mmToM(depth / 2) + 0.003]}>
        <boxGeometry args={[mmToM(width) * 0.6, 0.03, 0.005]} />
        <meshStandardMaterial color="#333" />
      </mesh>
    </group>
  )
}

export function EditableFurniture({ placements, badIds }: { placements: Placement[]; badIds: Set<string> }) {
  const select = useLayoutStore((s) => s.select)
  return (
    <group>
      {placements.map((p) => (
        <Item key={p.instanceId} p={p} bad={badIds.has(p.instanceId)} />
      ))}
      {/* 빈 바닥을 누르면 선택 해제 */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001} onPointerDown={() => select(null)} visible={false}>
        <planeGeometry args={[200, 200]} />
      </mesh>
    </group>
  )
}
