import { CameraControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type * as THREE from 'three'
import { mmToM } from '../lib/units'
import type { FurnitureLayout, RoomData } from '../types/schema'
import { DoorSwing } from './DoorSwing'
import { Fixtures } from './Fixtures'
import { Floor } from './Floor'
import { Furniture } from './Furniture'
import { Openings } from './Openings'
import { Walls } from './Walls'

export type ViewMode = 'quarter' | 'top'

export interface RoomSceneProps {
  room: RoomData
  /** 있으면 배치안의 placements를, 없으면 방의 existingFurniture를 그린다. */
  layout?: FurnitureLayout | null
  /** 처음 시점 (기본 쿼터뷰). M4-3 */
  initialView?: ViewMode
  /** 문 회전 반경 부채꼴 표시 (기본 true). M4-3 */
  showDoorSwing?: boolean
  /** 기본 가구 렌더 대신 그릴 내용 (M4-2 편집용 EditableFurniture 등). Canvas 안에 들어간다 */
  furniture?: ReactNode
}

interface Bounds {
  /** 방 중심 (m) */
  cx: number
  cz: number
  /** 방 가로·세로 (m) */
  w: number
  d: number
}

/**
 * 카메라 + 컨트롤. 쿼터뷰 = PerspectiveCamera 45°, 탑뷰 = OrthographicCamera.
 * 시점을 바꾸면 새 카메라가 직전 시점 위치에서 출발해 목표 위치로 부드럽게 이동한다.
 */
function Cameras({ view, bounds }: { view: ViewMode; bounds: Bounds }) {
  // 두 카메라 객체를 state로 들고 있다가, 활성 카메라를 CameraControls에 직접 넘긴다
  const [persp, setPersp] = useState<THREE.PerspectiveCamera | null>(null)
  const [ortho, setOrtho] = useState<THREE.OrthographicCamera | null>(null)
  const controls = useRef<CameraControls>(null)
  const size = useThree((s) => s.size)
  const { cx, cz, w, d } = bounds
  const dist = Math.max(w, d) * 1.2

  // 쿼터뷰 목표: 방 중심에서 남동쪽 위
  const quarterPos: [number, number, number] = [cx + dist * 0.8, dist * 1.3, cz + dist]
  // 탑뷰 목표: 바로 위 (z를 아주 살짝 + 해서 평면도 위쪽이 −Z가 되게)
  const topPos: [number, number, number] = [cx, dist * 2, cz + 0.001]
  // 탑뷰에서 방 전체가 화면의 80%에 들어오는 줌 (화면 px / m)
  const topZoom = Math.min(size.width / w, size.height / d) * 0.8

  const active = view === 'top' ? ortho : persp

  useEffect(() => {
    const c = controls.current
    if (!c || !active) return
    // 새 카메라를 직전 시점 위치에 둔 뒤(즉시) 목표 위치로 애니메이션
    const from = view === 'top' ? quarterPos : topPos
    const to = view === 'top' ? topPos : quarterPos
    c.setLookAt(...from, cx, 0, cz, false)
    void c.setLookAt(...to, cx, 0, cz, true)
    if (view === 'top') {
      c.zoomTo(topZoom * 0.5, false)
      void c.zoomTo(topZoom, true)
    }
    // 시점·방 크기가 바뀔 때만 실행 (창 크기 변화로 다시 움직이지 않게)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, active, cx, cz, w, d])

  return (
    <>
      <PerspectiveCamera ref={setPersp} makeDefault={view === 'quarter'} fov={45} near={0.05} far={200} position={quarterPos} />
      <OrthographicCamera ref={setOrtho} makeDefault={view === 'top'} near={0.05} far={200} position={topPos} zoom={topZoom} />
      {active && (
        <CameraControls
          key={view} // 카메라가 바뀌면 컨트롤을 새로 만든다
          ref={controls}
          camera={active}
          makeDefault
          maxPolarAngle={Math.PI / 2 - 0.05}
          // 탑뷰에서는 회전 금지 (이동·확대만)
          azimuthRotateSpeed={view === 'top' ? 0 : 1}
          polarRotateSpeed={view === 'top' ? 0 : 1}
        />
      )}
    </>
  )
}

const btn = (active: boolean) =>
  ({
    padding: '6px 12px',
    border: '1px solid #555',
    background: active ? '#2f6fed' : '#26272dcc',
    color: '#eee',
    cursor: 'pointer',
    fontSize: 13,
  }) as const

/** B·C 공용 진입점. props 모양을 바꿀 때는 C와 서로 PR 리뷰. */
export function RoomScene({ room, layout, initialView = 'quarter', showDoorSwing = true, furniture }: RoomSceneProps) {
  const [view, setView] = useState<ViewMode>(initialView)

  // 바닥 다각형 바운딩 박스 (mm)
  const box = useMemo(() => {
    const xs = room.floorPolygon.map((p) => p.x)
    const zs = room.floorPolygon.map((p) => p.z)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minZ = Math.min(...zs), maxZ = Math.max(...zs)
    return { center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }, w: maxX - minX, d: maxZ - minZ }
  }, [room.floorPolygon])

  const bounds: Bounds = {
    cx: mmToM(box.center.x),
    cz: mmToM(box.center.z),
    w: mmToM(box.w),
    d: mmToM(box.d),
  }
  const items = layout ? layout.placements : room.existingFurniture

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas shadows="percentage" dpr={[1, 2]} style={{ touchAction: 'none' }}>
        <color attach="background" args={['#1e1f24']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[bounds.cx + 3, 6, bounds.cz + 4]} intensity={1.2} castShadow />

        <Floor polygon={room.floorPolygon} />
        <Walls walls={room.walls} openings={room.openings} center={box.center} />
        <Openings walls={room.walls} openings={room.openings} />
        {showDoorSwing && <DoorSwing walls={room.walls} openings={room.openings} center={box.center} />}
        <Fixtures fixtures={room.fixtures} />
        {furniture ?? <Furniture items={items} />}

        <Cameras view={view} bounds={bounds} />
      </Canvas>

      <div style={{ position: 'absolute', right: 12, top: 12, display: 'flex', borderRadius: 6, overflow: 'hidden' }}>
        <button style={btn(view === 'quarter')} onClick={() => setView('quarter')}>쿼터뷰</button>
        <button style={btn(view === 'top')} onClick={() => setView('top')}>탑뷰</button>
      </div>
    </div>
  )
}
