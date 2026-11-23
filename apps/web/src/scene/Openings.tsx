import { mmToM } from '../lib/units'
import type { Opening, Wall } from '../types/schema'
import { wallFrame } from './wallGeometry'

/** 창문은 반투명 유리, 문은 닫힌 상태의 문짝으로 그린다. (문 회전 반경 부채꼴은 M4-3 DoorSwing) */
export function Openings({ walls, openings }: { walls: Wall[]; openings: Opening[] }) {
  return (
    <group>
      {openings.map((o) => {
        const wall = walls.find((w) => w.id === o.wallId)
        if (!wall || o.type === 'opening') return null
        const { angle } = wallFrame(wall)
        const centerAlong = o.offset + o.width / 2
        const isWindow = o.type === 'window'
        return (
          <group key={o.id} position={[mmToM(wall.start.x), 0, mmToM(wall.start.z)]} rotation-y={angle}>
            <mesh position={[mmToM(centerAlong), mmToM(o.sillHeight + o.height / 2), 0]}>
              <boxGeometry args={[mmToM(o.width), mmToM(o.height), mmToM(isWindow ? 20 : 40)]} />
              {isWindow ? (
                <meshStandardMaterial color="#9fd3ff" transparent opacity={0.35} />
              ) : (
                <meshStandardMaterial color="#8b5a2b" transparent opacity={0.85} />
              )}
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
