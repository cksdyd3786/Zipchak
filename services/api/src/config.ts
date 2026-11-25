// 환경변수 → 설정. 비밀 값은 .env 에만 둔다 (.env.example 참고).

export interface Config {
  port: number;
  /** CORS_ORIGIN 을 쉼표로 나눈 목록 */
  corsOrigins: string[];
  /** 끝의 / 를 뺀 엔진(D) 주소 */
  engineUrl: string;
}

export const DEFAULTS = {
  PORT: 4000,
  CORS_ORIGIN: "http://localhost:5173",
  ENGINE_URL: "http://localhost:8000",
} as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: parsePort(env.PORT),
    corsOrigins: (env.CORS_ORIGIN || DEFAULTS.CORS_ORIGIN)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    engineUrl: parseUrl("ENGINE_URL", env.ENGINE_URL || DEFAULTS.ENGINE_URL).replace(/\/+$/, ""),
  };
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULTS.PORT;
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port > 65535) throw new Error(`PORT 값이 잘못되었습니다: "${raw}" (0~65535 정수)`);
  return port;
}

function parseUrl(name: string, raw: string): string {
  try {
    new URL(raw);
  } catch {
    throw new Error(`${name} 값이 URL이 아닙니다: "${raw}"`);
  }
  return raw;
}
