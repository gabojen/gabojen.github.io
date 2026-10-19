// 화면 시험 설정 — 저장소 루트를 정적 서버로 띄워 실제 index.html 을 엽니다.
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: /smoke\.spec\.mjs/,
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'report' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:5577', ...devices['Pixel 7'], locale: 'ko-KR' },
  webServer: { command: 'python3 -m http.server 5577 --bind 127.0.0.1 --directory ..', url: 'http://127.0.0.1:5577/index.html', reuseExistingServer: true, timeout: 20000 },
});
