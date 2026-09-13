import { defineConfig } from "@playwright/test";
const production = process.env.TEST_PREVIEW === "1";
const baseURL = production ? "http://127.0.0.1:8090" : "http://127.0.0.1:8080";
export default defineConfig({
  testDir: "./tests/browser", workers: 1, timeout: 30000, retries: 0,
  use: { baseURL, headless: true, viewport: {width: 1440, height: 1000}, reducedMotion: "reduce", timezoneId: "America/Santiago", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: production ? "pnpm preview --host 127.0.0.1 --port 8090" : "pnpm dev --host 127.0.0.1", url: baseURL, reuseExistingServer: !process.env.CI },
});
