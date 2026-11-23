import { useMemo } from 'react'
import * as THREE from 'three'
import { mmToM } from '../lib/units'
import type { Point2 } from '../types/schema'

/** floorPolygon(mm, XZ 평면) → 바닥 메시 */
export function Floor({ polygon }: { polygon: Point2[] }) {
  const shape = useMemo(() => {
    // Shape는 XY 평면에 그린 뒤 X축으로 -90° 눕힌다. 이때 shape의 y = -z 이어야 world z가 맞다.
    const s = new THREE.Shape()
    polygon.forEach((p, i) => {
      const x = mmToM(p.x)
      const y = -mmToM(p.z)
      if (i === 0) s.moveTo(x, y)
      else s.lineTo(x, y)
    })
    s.closePath()
    return s
  }, [polygon])

  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#d9c7a7" side={THREE.DoubleSide} />
    </mesh>
  )
}
