// M3-1 GET /catalog — 큐레이션 카탈로그. 지금은 fixtures/catalog.json 을 메모리에 둔다 (DB 적재는 #13).
import { join } from "node:path";
import { Router, type Request } from "express";
import { AppError } from "../errors.js";
import { FIXTURES_DIR, readJsonFile } from "../paths.js";
import { CATEGORIES, formatIssues, validate } from "../schema.js";
import type { MarketFurnitureItem } from "../types.js";

export const CATALOG_PATH = join(FIXTURES_DIR, "catalog.json");

/** catalog.json 을 읽어 항목마다 MarketFurnitureItem 으로 검증한다. 하나라도 틀리면 던진다. */
export function loadCatalog(path: string = CATALOG_PATH): MarketFurnitureItem[] {
  const data = readJsonFile(path);
  if (!Array.isArray(data)) throw new Error(`카탈로그는 MarketFurnitureItem[] 배열이어야 합니다: ${path}`);
  const problems = data.flatMap((item, i) => {
    const result = validate("market-furniture-item", item);
    if (result.valid) return [];
    const id = (item as { itemId?: unknown })?.itemId ?? "(itemId 없음)";
    return [`[${i}] ${String(id)}\n${formatIssues(result.errors)}`];
  });
  if (problems.length) {
    throw new Error(`카탈로그 ${path} 에 MarketFurnitureItem 스키마를 통과하지 못한 항목이 있습니다:\n${problems.join("\n")}`);
  }
  return data as MarketFurnitureItem[];
}

export interface CatalogQuery {
  category?: string;
  maxWidth?: number;
  maxDepth?: number;
  maxPrice?: number;
}

/** docs/openapi.yaml /catalog parameters. 틀린 값은 모아서 400 VALIDATION_FAILED. 모르는 파라미터는 무시한다. */
export function parseCatalogQuery(query: Request["query"]): CatalogQuery {
  const errors: { path: string; message: string }[] = [];
  const parsed: CatalogQuery = {};

  const single = (name: string): string | undefined => {
    const v = query[name];
    if (v === undefined) return undefined;
    if (typeof v !== "string") {
      errors.push({ path: name, message: "한 번만, 문자열로 보내야 합니다" });
      return undefined;
    }
    return v;
  };

  const category = single("category");
  if (category !== undefined) {
    if (CATEGORIES.includes(category)) parsed.category = category;
    else errors.push({ path: "category", message: `다음 중 하나여야 합니다: ${CATEGORIES.join(", ")}` });
  }

  const integer = (name: "maxWidth" | "maxDepth" | "maxPrice", minimum: number) => {
    const raw = single(name);
    if (raw === undefined) return;
    const n = Number(raw);
    if (/^\d+$/.test(raw) && Number.isSafeInteger(n) && n >= minimum) parsed[name] = n;
    else errors.push({ path: name, message: `${minimum} 이상의 정수여야 합니다` });
  };
  integer("maxWidth", 1);
  integer("maxDepth", 1);
  integer("maxPrice", 0);

  if (errors.length) {
    throw new AppError("VALIDATION_FAILED", 400, "카탈로그 조회 파라미터가 잘못되었습니다", { in: "query", errors });
  }
  return parsed;
}

/** status = available 만, 그리고 주어진 조건(이하)을 모두 만족하는 항목. 원래 순서를 지킨다. */
export function filterCatalog(items: MarketFurnitureItem[], q: CatalogQuery): MarketFurnitureItem[] {
  return items.filter(
    (item) =>
      item.status === "available" &&
      (q.category === undefined || item.category === q.category) &&
      (q.maxWidth === undefined || item.dimensions.width <= q.maxWidth) &&
      (q.maxDepth === undefined || item.dimensions.depth <= q.maxDepth) &&
      (q.maxPrice === undefined || item.price.amount <= q.maxPrice),
  );
}

export function catalogRouter(items: MarketFurnitureItem[] = loadCatalog()): Router {
  const router = Router();
  const byId = new Map(items.map((item) => [item.itemId, item]));

  router.get("/catalog", (req, res) => {
    res.json(filterCatalog(items, parseCatalogQuery(req.query)));
  });

  // GET /catalog/:itemId — 목록과 달리 status = unavailable 도 돌려준다.
  // 이미 저장된 배치안의 가구를 3D·구매 패널(M3-5)에 계속 보여 주고, 품절 표시는 웹이 status 로 한다.
  router.get("/catalog/:itemId", (req, res, next) => {
    const item = byId.get(req.params.itemId);
    if (!item) return next(new AppError("NOT_FOUND", 404, "상품을 찾을 수 없습니다", { itemId: req.params.itemId }));
    res.json(item);
  });
  return router;
}
