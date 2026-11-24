import { mmToM } from '../lib/units'
import type { Fixture } from '../types/schema'

/** 배치 불가 고정물(라디에이터·기둥·에어컨 등)을 회색 박스로 표시한다. */
export function Fixtures({ fixtures }: { fixtures: Fixture[] }) {
  return (
    <group>
      {fixtures.map((fx) => {
        if (fx.footprint && fx.footprint.length >= 3) {
          // footprint의 바운딩 박스로 근사
          const xs = fx.footprint.map((p) => p.x)
          const zs = fx.footprint.map((p) => p.z)
          const minX = Math.min(...xs), maxX = Math.max(...xs)
          const minZ = Math.min(...zs), maxZ = Math.max(...zs)
          const h = fx.height ?? 100
          return (
            <mesh key={fx.id} position={[mmToM((minX + maxX) / 2), mmToM(h / 2), mmToM((minZ + maxZ) / 2)]}>
              <boxGeometry args={[mmToM(maxX - minX), mmToM(h), mmToM(maxZ - minZ)]} />
              <meshStandardMaterial color="#8a8a8a" />
            </mesh>
          )
        }
        if (fx.position) {
          // 위치만 있는 고정물(에어컨 등): 작은 박스, 바람 방향과 수직으로 길게
          const alongZ = fx.direction ? Math.abs(fx.direction.x) > Math.abs(fx.direction.z) : false
          const long = mmToM(800), short = mmToM(250)
          return (
            <mesh key={fx.id} position={[mmToM(fx.position.x), mmToM(fx.position.y), mmToM(fx.position.z)]}>
              <boxGeometry args={[alongZ ? short : long, mmToM(300), alongZ ? long : short]} />
              <meshStandardMaterial color="#e8e8e8" />
            </mesh>
          )
        }
        return null
      })}
    </group>
  )
}
