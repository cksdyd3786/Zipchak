// 방(RoomData) → 편집용 배치안(FurnitureLayout).
// 스캔한 방의 기존 가구(existingFurniture)를 그대로 placements로 옮긴다. movable=false면 locked.
import type { Dimensions, FurnitureLayout, Placement, RoomData } from '../types/schema'

export function layoutFromRoom(room: RoomData, now = new Date()): FurnitureLayout {
  const t = now.toISOString()
  return {
    schemaVersion: '1.0',
    layoutId: `lay_local_${room.roomId.replace(/^room_/, '')}`,
    roomId: room.roomId,
    version: 1,
    kind: 'user_saved',
    createdBy: { type: 'user', id: room.ownerId, displayName: '나' },
    title: `${room.name} 배치`,
    placements: room.existingFurniture.map(
      (f): Placement => ({
        instanceId: f.instanceId,
        source: 'existing',
        catalogItemId: f.catalogItemId ?? null,
        category: f.category,
        dimensions: f.dimensions,
        position: f.position,
        rotationDeg: f.rotationDeg,
        locked: !f.movable,
      }),
    ),
    analysis: null,
    postits: [],
    createdAt: t,
    updatedAt: t,
  }
}

/** [+ 가구] 버튼으로 넣는 기본 규격 (mm) */
export const QUICK_FURNITURE: { category: string; label: string; dimensions: Dimensions }[] = [
  { category: 'bed', label: '침대', dimensions: { width: 1100, depth: 2000, height: 450 } },
  { category: 'desk', label: '책상', dimensions: { width: 1200, depth: 600, height: 730 } },
  { category: 'chair', label: '의자', dimensions: { width: 500, depth: 500, height: 850 } },
  { category: 'storage', label: '수납장', dimensions: { width: 800, depth: 400, height: 900 } },
  { category: 'wardrobe', label: '옷장', dimensions: { width: 1000, depth: 600, height: 2000 } },
]

/** 방 중심에 새 가구 하나 (50mm 스냅) */
export function newPlacement(room: RoomData, category: string, dimensions: Dimensions, seq: number): Placement {
  const xs = room.floorPolygon.map((p) => p.x)
  const zs = room.floorPolygon.map((p) => p.z)
  const snap = (v: number) => Math.round(v / 50) * 50
  return {
    instanceId: `inst_new_${category}_${seq}`,
    source: 'custom',
    catalogItemId: null,
    category,
    dimensions,
    position: { x: snap((Math.min(...xs) + Math.max(...xs)) / 2), z: snap((Math.min(...zs) + Math.max(...zs)) / 2) },
    rotationDeg: 0,
    locked: false,
  }
}
