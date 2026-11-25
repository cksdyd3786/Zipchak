// M1-3 GET /templates — 원룸 템플릿 3종. 데이터는 A가 packages/schema/fixtures/templates/ 에 작성한다.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Router } from "express";
import { FIXTURES_DIR, readJsonFile } from "../paths.js";
import { formatIssues, validate } from "../schema.js";
import type { RoomData } from "../types.js";

export const TEMPLATES_DIR = join(FIXTURES_DIR, "templates");

/**
 * 템플릿 JSON 을 모두 읽어 RoomData 로 검증한다. 하나라도 틀리면 바로 던진다 (서버가 뜨지 않는다).
 * 순서는 파일 이름의 숫자 순 (tpl-4py → tpl-5py → tpl-6py).
 */
export function loadTemplates(dir: string = TEMPLATES_DIR): RoomData[] {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (files.length === 0) throw new Error(`템플릿 파일이 없습니다: ${dir}`);

  return files.map((file) => {
    const data = readJsonFile(join(dir, file));
    const result = validate("room", data);
    if (!result.valid) {
      throw new Error(`템플릿 ${file} 이(가) RoomData 스키마를 통과하지 못했습니다:\n${formatIssues(result.errors)}`);
    }
    const room = data as RoomData;
    if (room.source !== "template") {
      throw new Error(`템플릿 ${file} 의 source 가 "template" 이 아닙니다: "${room.source}"`);
    }
    return room;
  });
}

export function templatesRouter(templates: RoomData[] = loadTemplates()): Router {
  const router = Router();
  router.get("/templates", (_req, res) => {
    res.json(templates);
  });
  return router;
}
