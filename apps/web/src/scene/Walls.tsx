import { mmToM } from '../lib/units'
import type { Opening, Point2, Wall } from '../types/schema'
import { outwardSign, wallFrame, wallPieces } from './wallGeometry'

export function Walls({ walls, openings, center }: { walls: Wall[]; openings: Opening[]; center: Point2 }) {
  return (
    <group>
      {walls.map((wall) => {
        const { length, angle } = wallFrame(wall)
        const sign = outwardSign(wall, center, angle)
        const pieces = wallPieces(length, wall.height, openings.filter((o) => o.wallId === wall.id))
        return (
          <group
            key={wall.id}
            position={[mmToM(wall.start.x), 0, mmToM(wall.start.z)]}
            rotation-y={angle}
          >
            {pieces.map((p, i) => {
              // 바깥 모서리가 비지 않게, 벽 양 끝 조각은 두께만큼 바깥으로 늘린다
              const from = p.from === 0 ? -wall.thickness : p.from
              const to = p.to === length ? length + wall.thickness : p.to
              return (
                <mesh
                  key={i}
                  position={[
                    mmToM((from + to) / 2),
                    mmToM((p.bottom + p.top) / 2),
                    mmToM((sign * wall.thickness) / 2),
                  ]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[mmToM(to - from), mmToM(p.top - p.bottom), mmToM(wall.thickness)]} />
                  <meshStandardMaterial color="#f2efe9" />
                </mesh>
              )
            })}
          </group>
        )
      })}
    </group>
  )
}
