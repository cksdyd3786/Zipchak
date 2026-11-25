// M4-2 배치 편집 상태. 가구 상태는 FurnitureLayout.placements 모양 그대로 둔다.
import { create } from 'zustand'
import { rotate90, snap } from '../layout/collision'
import type { FurnitureLayout, Placement } from '../types/schema'

interface LayoutState {
  layout: FurnitureLayout | null
  selectedId: string | null
  /** 드래그 중인 가구 (카메라 조작 잠금용) */
  draggingId: string | null
  setLayout: (layout: FurnitureLayout) => void
  select: (id: string | null) => void
  setDragging: (id: string | null) => void
  /** mm 좌표로 이동 (50mm 스냅) */
  move: (id: string, x: number, z: number) => void
  rotate: (id: string) => void
  remove: (id: string) => void
  /** 새 가구 추가 후 선택 */
  add: (p: Placement) => void
}

const patch = (layout: FurnitureLayout, id: string, fn: (p: Placement) => Placement): FurnitureLayout => ({
  ...layout,
  placements: layout.placements.map((p) => (p.instanceId === id && !p.locked ? fn(p) : p)),
})

export const useLayoutStore = create<LayoutState>((set) => ({
  layout: null,
  selectedId: null,
  draggingId: null,
  setLayout: (layout) => set({ layout, selectedId: null, draggingId: null }),
  select: (selectedId) => set({ selectedId }),
  setDragging: (draggingId) => set({ draggingId }),
  move: (id, x, z) =>
    set((s) => (s.layout ? { layout: patch(s.layout, id, (p) => ({ ...p, position: { x: snap(x), z: snap(z) } })) } : s)),
  rotate: (id) =>
    set((s) => (s.layout ? { layout: patch(s.layout, id, (p) => ({ ...p, rotationDeg: rotate90(p.rotationDeg) })) } : s)),
  remove: (id) =>
    set((s) =>
      s.layout
        ? {
            layout: { ...s.layout, placements: s.layout.placements.filter((p) => p.instanceId !== id || p.locked) },
            selectedId: s.selectedId === id ? null : s.selectedId,
          }
        : s,
    ),
  add: (p) => set((s) => (s.layout ? { layout: { ...s.layout, placements: [...s.layout.placements, p] }, selectedId: p.instanceId } : s)),
}))
