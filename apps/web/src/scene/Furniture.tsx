import { degToRad, mmToM } from '../lib/units'
import type { Dimensions, Point2, RotationDeg } from '../types/schema'

export interface FurnitureItem {
  instanceId: string
  category: string
  dimensions: Dimensions
  /** 바닥면 중심 (mm) */
  position: Point2
  rotationDeg: RotationDeg
}

const CATEGORY_COLOR: Record<string, string> = {
  bed: '#7fa7d9',
  desk: '#c79a6b',
  chair: '#e0b15c',
  storage: '#9c8cc9',
  shelf: '#a3b18a',
  table: '#d08c60',
  wardrobe: '#8d7b68',
  sofa: '#d77a8f',
  lamp: '#f2d16b',
  decor: '#8fc9b9',
  etc: '#b0b0b0',
}

/**
 * 가구를 규격 크기 박스로 그린다. (.glb 모델 로딩은 이후 단계, 실패 시에도 이 박스가 대체물)
 * 기준점은 바닥면 중심, width=X·depth=Z·height=Y, 회전 0도에서 정면 +Z.
 */
export function Furniture({ items }: { items: FurnitureItem[] }) {
  return (
    <group>
      {items.map((f) => {
        const { width, depth, height } = f.dimensions
        return (
          <group
            key={f.instanceId}
            position={[mmToM(f.position.x), 0, mmToM(f.position.z)]}
            rotation-y={degToRad(f.rotationDeg)}
          >
            <mesh position={[0, mmToM(height / 2), 0]} castShadow receiveShadow>
              <boxGeometry args={[mmToM(width), mmToM(height), mmToM(depth)]} />
              <meshStandardMaterial color={CATEGORY_COLOR[f.category] ?? CATEGORY_COLOR.etc} />
            </mesh>
            {/* 정면(+Z) 표시용 얇은 띠 */}
            <mesh position={[0, mmToM(height / 2), mmToM(depth / 2) + 0.003]}>
              <boxGeometry args={[mmToM(width) * 0.6, 0.03, 0.005]} />
              <meshStandardMaterial color="#333333" />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
