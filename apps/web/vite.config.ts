import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const schemaDir = fileURLToPath(new URL('../../packages/schema', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // 공통 스키마·fixture를 '@schema/...'로 import (예: '@schema/fixtures/room.sample.json')
    alias: { '@schema': schemaDir },
  },
  server: {
    // apps/web 밖(packages/schema)의 파일을 개발 서버가 읽을 수 있게 허용
    fs: { allow: ['.', schemaDir] },
  },
})
