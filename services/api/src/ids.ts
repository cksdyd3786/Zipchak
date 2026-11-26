// ID = prefix_ + ULID (루트 CLAUDE.md 좌표·단위 규약). 예: room_01HX..., lay_01HX...
import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID 26자: 앞 10자 = 밀리초 시각(48bit), 뒤 16자 = 난수(80bit). Crockford Base32. */
export function ulid(now: number = Date.now()): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = randomBytes(10);
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let rand = "";
  for (let i = 0; i < 16; i++) {
    rand = CROCKFORD[Number(bits & 31n)] + rand;
    bits >>= 5n;
  }
  return time + rand;
}

export function newId(prefix: "room" | "lay" | "pin" | "user"): string {
  return `${prefix}_${ulid()}`;
}

/** ISO 8601 UTC (루트 CLAUDE.md "시간" 규약) */
export function nowIso(): string {
  return new Date().toISOString();
}
