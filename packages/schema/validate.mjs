// fixtures/ 의 모든 예시 데이터가 스키마를 통과하는지 검사한다. CI에서도 실행된다.
// 파일 이름 규칙: room*.json → RoomData, catalog*.json → MarketFurnitureItem[], layout*.json → FurnitureLayout
// rooms/ 하위 폴더의 파일은 모두 RoomData 로 검사한다 (A가 제출하는 실측 스캔).
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath: Windows에서도 C:\... 경로가 깨지지 않게 한다 (URL.pathname은 /C:/... 가 됨)
const here = fileURLToPath(new URL(".", import.meta.url));
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
  // 운영체제와 상관없이 "fixtures/rooms/a.json" 형태로 비교한다
  const rel = relative(here, file).split(sep).join("/");
  const name = basename(file);
  const data = JSON.parse(readFileSync(file, "utf8"));
  const checks = rel.includes("/rooms/") || rel.includes("/templates/") || name.startsWith("room")
    ? [[validators.room, data]]
    : name.startsWith("catalog")
      ? data.map((item) => [validators.item, item])
      : name.startsWith("layout")
        ? [[validators.layout, data]]
        : [];
  if (!checks.length) {
    console.warn(`? ${rel} — 파일 이름 규칙에 맞지 않아 검사하지 않음 (room*/catalog*/layout* 또는 rooms/, templates/ 폴더)`);
    continue;
  }
  let fileOk = true;
  for (const [validate, value] of checks) {
    if (!validate(value)) {
      failed++;
      fileOk = false;
      console.error(`✗ ${rel}`);
      for (const e of validate.errors) console.error(`   ${e.instancePath || "/"} ${e.message}`);
    }
  }
  if (fileOk) console.log(`✓ ${rel}`);
}
if (failed) {
  console.error(`\n${failed}건 실패`);
  process.exit(1);
}
console.log("\n모든 fixture가 스키마를 통과했습니다.");
