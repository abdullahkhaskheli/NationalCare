import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  use: { baseURL: "http://127.0.0.1:5173", headless: true },
  reporter: "list",
  timeout: 45000,
  workers: 1,
});
