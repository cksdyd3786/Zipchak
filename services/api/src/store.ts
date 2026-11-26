// 방·배치안 저장소 (M0-2). 지금은 메모리 구현만 있다 — 서버를 다시 켜면 비워진다.
// PostgreSQL(JSONB, Prisma) 구현은 같은 인터페이스로 바꿔 끼운다 (services/api/CLAUDE.md "구조").
// 넣고 꺼낼 때 복사본을 돌려줘서, 라우트가 받은 객체를 고쳐도 저장된 값이 바뀌지 않게 한다.
import type { FurnitureLayout, RoomData } from "./types.js";

export interface Store {
  createRoom(room: RoomData): Promise<RoomData>;
  getRoom(roomId: string): Promise<RoomData | undefined>;
  listRoomsByOwner(ownerId: string): Promise<RoomData[]>;

  createLayout(layout: FurnitureLayout): Promise<FurnitureLayout>;
  getLayout(layoutId: string): Promise<FurnitureLayout | undefined>;
  listLayoutsByRoom(roomId: string): Promise<FurnitureLayout[]>;
  /** expectedVersion 이 저장된 version 과 같을 때만 바꾼다. 다르면 { conflict: 저장된 version } */
  updateLayout(layout: FurnitureLayout, expectedVersion: number): Promise<{ layout: FurnitureLayout } | { conflict: number }>;
}

export class MemoryStore implements Store {
  private rooms = new Map<string, RoomData>();
  private layouts = new Map<string, FurnitureLayout>();

  async createRoom(room: RoomData) {
    this.rooms.set(room.roomId, structuredClone(room));
    return structuredClone(room);
  }

  async getRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    return room && structuredClone(room);
  }

  async listRoomsByOwner(ownerId: string) {
    return [...this.rooms.values()].filter((r) => r.ownerId === ownerId).map((r) => structuredClone(r));
  }

  async createLayout(layout: FurnitureLayout) {
    this.layouts.set(layout.layoutId, structuredClone(layout));
    return structuredClone(layout);
  }

  async getLayout(layoutId: string) {
    const layout = this.layouts.get(layoutId);
    return layout && structuredClone(layout);
  }

  async listLayoutsByRoom(roomId: string) {
    return [...this.layouts.values()].filter((l) => l.roomId === roomId).map((l) => structuredClone(l));
  }

  async updateLayout(layout: FurnitureLayout, expectedVersion: number) {
    const current = this.layouts.get(layout.layoutId);
    if (!current) throw new Error(`없는 배치안: ${layout.layoutId}`);
    if (current.version !== expectedVersion) return { conflict: current.version };
    this.layouts.set(layout.layoutId, structuredClone(layout));
    return { layout: structuredClone(layout) };
  }
}
