// 집착 REST API 진입점 (담당 E). 앱 구성은 app.ts, 여기서는 listen 만 한다.
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

// services/api/.env 가 있으면 읽는다 (Node 내장 기능, 없으면 기본값·셸 환경변수만 쓴다)
try {
  process.loadEnvFile();
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}

const config = loadConfig();
const app = createApp({ config });
app.listen(config.port, () => console.log(`[api] listening on :${config.port}`));
