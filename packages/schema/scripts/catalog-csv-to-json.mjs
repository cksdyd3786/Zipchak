// 카탈로그 시트(CSV) → MarketFurnitureItem[] JSON. 의존성 없음 (Node 20+).
// 양식: fixtures/catalog-sheet.template.csv (첫 줄 = 열 이름)
// 사용: node scripts/catalog-csv-to-json.mjs 시트.csv > fixtures/catalog.json
//   - 여러 값 열(lifestyleTags, styleTags)은 세미콜론(;)으로 구분
//   - TRUE/FALSE 는 대소문자 무관, 빈 칸은 null 또는 생략
//   - 필수 열이 비면 몇 번째 줄인지 알려 주고 실패한다. 최종 검사는 npm run validate.
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("사용: node scripts/catalog-csv-to-json.mjs <시트.csv>");
  process.exit(1);
}

// 따옴표·쉼표·줄바꿈을 처리하는 최소 CSV 파서
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const REQUIRED = [
  "itemId", "category", "name", "brand", "market", "purchaseUrl", "priceKRW",
  "widthMm", "depthMm", "heightMm", "againstWall", "glbUrl", "assetFidelity", "verifiedAt",
];

const [header, ...lines] = parseCsv(readFileSync(file, "utf8"));
const cols = header.map((h) => h.trim());
const missingCols = REQUIRED.filter((c) => !cols.includes(c));
if (missingCols.length) {
  console.error(`열이 없습니다: ${missingCols.join(", ")}`);
  process.exit(1);
}

const errors = [];
const int = (v) => (v === "" ? 0 : Number.parseInt(v, 10));
const bool = (v) => v.trim().toUpperCase() === "TRUE";
const list = (v) => v.split(";").map((s) => s.trim()).filter(Boolean);

const items = lines.map((cells, idx) => {
  const lineNo = idx + 2;
  const r = Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? "").trim()]));
  for (const c of REQUIRED) if (r[c] === "") errors.push(`${lineNo}번째 줄: ${c} 비어 있음`);
  for (const c of ["priceKRW", "widthMm", "depthMm", "heightMm"]) {
    if (r[c] !== "" && !/^\d+$/.test(r[c])) errors.push(`${lineNo}번째 줄: ${c}는 정수여야 함 (지금: ${r[c]})`);
  }
  const item = {
    schemaVersion: "1.0",
    itemId: r.itemId,
    category: r.category,
    name: r.name,
    brand: r.brand,
    market: r.market,
    purchaseUrl: r.purchaseUrl,
    affiliateUrl: null,
    price: { amount: int(r.priceKRW), currency: "KRW" },
    dimensions: { width: int(r.widthMm), depth: int(r.depthMm), height: int(r.heightMm) },
    clearance: {
      front: int(r.clearFrontMm ?? ""),
      back: int(r.clearBackMm ?? ""),
      left: int(r.clearLeftMm ?? ""),
      right: int(r.clearRightMm ?? ""),
    },
    placementRules: {
      againstWall: r.againstWall,
      underWindowAllowed: bool(r.underWindowAllowed ?? ""),
      stackable: bool(r.stackable ?? ""),
    },
    lifestyleTags: list(r.lifestyleTags ?? ""),
    styleTags: list(r.styleTags ?? ""),
    asset: {
      glbUrl: r.glbUrl,
      thumbnailUrl: r.thumbnailUrl || null,
      assetFidelity: r.assetFidelity,
      originAtFootprintCenter: true,
    },
    sponsor: { isSponsored: false, boost: 0 },
    status: r.status || "available",
    verifiedAt: r.verifiedAt,
  };
  if (r.color) item.color = r.color;
  return item;
});

const dup = items.map((i) => i.itemId).filter((id, i, a) => id && a.indexOf(id) !== i);
if (dup.length) errors.push(`itemId 중복: ${[...new Set(dup)].join(", ")}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
process.stdout.write(JSON.stringify(items, null, 2) + "\n");
console.error(`${items.length}개 변환 완료`);
