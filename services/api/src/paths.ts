// 저장소 루트 기준 경로. 실행 위치(cwd)와 상관없이 같은 파일을 읽는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// services/api/src/paths.ts (tsx·vitest) 와 services/api/dist/paths.js (빌드) 모두 세 단계 위가 루트다.
// fileURLToPath: Windows에서도 C:\... 경로가 깨지지 않게 한다.
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const SCHEMA_DIR = join(REPO_ROOT, "packages", "schema");
export const FIXTURES_DIR = join(SCHEMA_DIR, "fixtures");

export function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`JSON 파일을 읽을 수 없습니다: ${path} — ${(e as Error).message}`);
  }
}
