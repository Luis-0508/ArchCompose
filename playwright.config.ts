import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the frontend in a browser against the Vite dev server.
 * The browser platform adapter replaces Tauri's file dialogs with file inputs, so
 * every workflow except native dialogs and disk paths is covered here.
 */
// E2E_PORT runs the tests on another port when 1420 is in use (another checkout's dev server).
const port = Number(process.env.E2E_PORT ?? 1420);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: port === 1420 ? "npm run dev" : `npx vite --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
