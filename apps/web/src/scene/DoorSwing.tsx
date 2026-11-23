import { useMemo } from 'react'
import * as THREE from 'three'
import { mmToM } from '../lib/units'
import type { Opening, Point2, Wall } from '../types/schema'
import { doorSwingSectors } from './doorSwingGeometry'

/** 문마다 회전 반경 부채꼴을 바닥 위에 반투명으로 그린다. */
export function DoorSwing({ walls, openings, center }: { walls: Wall[]; openings: Opening[]; center: Point2 }) {
  const shapes = useMemo(
    () =>
      doorSwingSectors(walls, openings, center).map((sector) => {
        // Floor와 같은 방식: XY 평면에 (x, -z)로 그린 뒤 X축 -90° 회전
        const shape = new THREE.Shape(sector.polygon.map((p) => new THREE.Vector2(mmToM(p.x), -mmToM(p.z))))
        return { id: sector.openingId, shape }
      }),
    [walls, openings, center],
  )

  return (
    <group>
      {shapes.map(({ id, shape }) => (
        // 바닥과 겹쳐 깜빡이지 않게 5mm 띄운다
        <mesh key={id} rotation-x={-Math.PI / 2} position-y={0.005} renderOrder={1}>
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial color="#ff9f43" transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}
