// fixtures/ 의 모든 예시 데이터가 스키마를 통과하는지 검사한다. CI에서도 실행된다.
// 파일 이름 규칙: room*.json → RoomData, catalog*.json → MarketFurnitureItem[], layout*.json → FurnitureLayout
// rooms/ 하위 폴더의 파일은 모두 RoomData 로 검사한다 (A가 제출하는 실측 스캔).
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const load = (p) => JSON.parse(readFileSync(join(here, p), "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validators = {
  room: ajv.compile(load("room.schema.json")),
  item: ajv.compile(load("market-furniture-item.schema.json")),
  layout: ajv.compile(load("furniture-layout.schema.json")),
};

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".json") ? [p] : [];
  });
}

let failed = 0;
for (const file of walk(join(here, "fixtures"))) {
  const rel = file.slice(here.length);
  const name = rel.split("/").pop();
  const data = JSON.parse(readFileSync(file, "utf8"));
  const checks = rel.includes("/rooms/") || name.startsWith("room")
    ? [[validators.room, data]]
    : name.startsWith("catalog")
      ? data.map((item) => [validators.item, item])
      : name.startsWith("layout")
        ? [[validators.layout, data]]
        : [];
  for (const [validate, value] of checks) {
    if (!validate(value)) {
      failed++;
      console.error(`✗ ${rel}`);
      for (const e of validate.errors) console.error(`   ${e.instancePath || "/"} ${e.message}`);
    }
  }
  if (checks.length) console.log(`✓ ${rel}`);
}
if (failed) {
  console.error(`\n${failed}건 실패`);
  process.exit(1);
}
console.log("\n모든 fixture가 스키마를 통과했습니다.");
