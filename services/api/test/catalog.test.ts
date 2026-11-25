import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { CATALOG_PATH, filterCatalog, loadCatalog } from "../src/routes/catalog.js";
import { readJsonFile } from "../src/paths.js";
import { validate } from "../src/schema.js";
import type { MarketFurnitureItem } from "../src/types.js";
import { startServer, type TestServer } from "./helpers.js";

const fixture = readJsonFile(CATALOG_PATH) as MarketFurnitureItem[];
const ids = (items: MarketFurnitureItem[]) => items.map((i) => i.itemId);

let server: TestServer;
beforeAll(async () => {
  server = await startServer(createApp({ config: loadConfig({}) }));
});
afterAll(() => server.close());

const get = async (qs = "") => {
  const res = await fetch(`${server.url}/catalog${qs}`);
  return { status: res.status, body: await res.json() };
};

describe("GET /catalog (M3-1)", () => {
  it("파라미터 없이 → 전체 25개, 모두 스키마 통과", async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body).toHaveLength(25);
    for (const item of body) expect(validate("market-furniture-item", item)).toEqual({ valid: true });
  });

  it("category 필터", async () => {
    const { status, body } = await get("?category=desk");
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((i: MarketFurnitureItem) => i.category === "desk")).toBe(true);
    expect(ids(body)).toEqual(ids(fixture.filter((i) => i.category === "desk")));
  });

  it("maxWidth 필터 (이하)", async () => {
    const { body } = await get("?maxWidth=1000");
    const expected = fixture.filter((i) => i.dimensions.width <= 1000);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(25);
    expect(ids(body)).toEqual(ids(expected));
  });

  it("maxDepth 필터 (이하)", async () => {
    const { body } = await get("?maxDepth=400");
    const expected = fixture.filter((i) => i.dimensions.depth <= 400);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(25);
    expect(ids(body)).toEqual(ids(expected));
  });

  it("category + maxWidth + maxDepth 조합", async () => {
    const { body } = await get("?category=desk&maxWidth=1200&maxDepth=600");
    const expected = fixture.filter((i) => i.category === "desk" && i.dimensions.width <= 1200 && i.dimensions.depth <= 600);
    expect(expected.length).toBeGreaterThan(0);
    expect(ids(body)).toEqual(ids(expected));
  });

  it("maxPrice 필터 (이하, 0 허용)", async () => {
    const { body } = await get("?maxPrice=50000");
    expect(ids(body)).toEqual(ids(fixture.filter((i) => i.price.amount <= 50000)));
    expect((await get("?maxPrice=0")).status).toBe(200);
  });

  it("잘못된 category → 400 VALIDATION_FAILED", async () => {
    const { status, body } = await get("?category=spaceship");
    expect(status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.details.errors[0].path).toBe("category");
  });

  it.each(["maxWidth=abc", "maxWidth=0", "maxWidth=12.5", "maxDepth=-1", "maxPrice=", "category=bed&category=desk"])(
    "잘못된 파라미터 %s → 400",
    async (qs) => {
      const { status, body } = await get(`?${qs}`);
      expect(status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_FAILED");
    },
  );
});

describe("filterCatalog", () => {
  it("status = unavailable 은 빼고 돌려준다", () => {
    const items = [fixture[0], { ...fixture[1], status: "unavailable" as const }];
    expect(ids(filterCatalog(items, {}))).toEqual([fixture[0].itemId]);
  });
});

describe("loadCatalog — 시작 시 검증", () => {
  const dir = mkdtempSync(join(tmpdir(), "zipchak-cat-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("fixture 25개를 읽는다", () => {
    expect(loadCatalog()).toHaveLength(25);
  });

  it("틀린 항목이 하나라도 있으면 itemId 와 경로를 담아 던진다", () => {
    const path = join(dir, "catalog.json");
    writeFileSync(path, JSON.stringify([fixture[0], { ...fixture[1], dimensions: { width: 0, depth: 1, height: 1 } }]));
    expect(() => loadCatalog(path)).toThrow(new RegExp(`${fixture[1].itemId}[\\s\\S]*/dimensions/width`));
  });

  it("배열이 아니면 던진다", () => {
    const path = join(dir, "obj.json");
    writeFileSync(path, "{}");
    expect(() => loadCatalog(path)).toThrow(/배열/);
  });
});
