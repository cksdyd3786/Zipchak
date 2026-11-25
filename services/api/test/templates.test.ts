import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { TEMPLATES_DIR, loadTemplates } from "../src/routes/templates.js";
import { readJsonFile } from "../src/paths.js";
import { validate } from "../src/schema.js";
import { startServer, type TestServer } from "./helpers.js";

let server: TestServer;
beforeAll(async () => {
  server = await startServer(createApp({ config: loadConfig({}) }));
});
afterAll(() => server.close());

describe("GET /templates (M1-3)", () => {
  it("템플릿 3개를 4평 → 5평 → 6평 순서로 돌려준다", async () => {
    const res = await fetch(`${server.url}/templates`);
    expect(res.status).toBe(200);
    const rooms = await res.json();
    expect(rooms).toHaveLength(3);
    expect(rooms.map((r: any) => r.sourceMeta.templateId)).toEqual(["tpl_4py", "tpl_5py", "tpl_6py"]);
  });

  it("전부 source = template 이고 RoomData 스키마를 통과한다", async () => {
    const rooms = await (await fetch(`${server.url}/templates`)).json();
    for (const room of rooms) {
      expect(room.source).toBe("template");
      expect(validate("room", room)).toEqual({ valid: true });
    }
  });
});

describe("loadTemplates — 시작 시 검증", () => {
  const dir = mkdtempSync(join(tmpdir(), "zipchak-tpl-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const good = readJsonFile(join(TEMPLATES_DIR, "tpl-4py-studio.json")) as Record<string, any>;

  it("스키마에 맞지 않는 파일이 하나라도 있으면 던진다", () => {
    writeFileSync(join(dir, "tpl-4py.json"), JSON.stringify(good));
    writeFileSync(join(dir, "tpl-5py.json"), JSON.stringify({ ...good, ceilingHeight: 100 }));
    expect(() => loadTemplates(dir)).toThrow(/tpl-5py\.json.*RoomData[\s\S]*\/ceilingHeight/);
  });

  it("source 가 template 이 아니면 던진다", () => {
    rmSync(join(dir, "tpl-5py.json"));
    writeFileSync(join(dir, "tpl-5py.json"), JSON.stringify({ ...good, source: "manual" }));
    expect(() => loadTemplates(dir)).toThrow(/source/);
  });

  it("JSON 이 깨져 있으면 던진다", () => {
    writeFileSync(join(dir, "tpl-5py.json"), "{");
    expect(() => loadTemplates(dir)).toThrow(/JSON/);
  });
});
