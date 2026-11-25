// 본문 구조의 원본은 packages/schema/*.schema.json 이다. 전체 타입은 나중에 json-schema-to-typescript 로 생성하고,
// 여기에는 API 코드가 실제로 읽는 필드만 적는다. ajv 검증을 통과한 값에만 이 타입을 붙인다.

export interface RoomData {
  roomId: string;
  source: "lidar" | "manual" | "template" | "floorplan";
  [key: string]: unknown;
}

export interface MarketFurnitureItem {
  itemId: string;
  category: string;
  status: "available" | "unavailable";
  price: { amount: number; currency: "KRW" };
  dimensions: { width: number; depth: number; height: number };
  [key: string]: unknown;
}
