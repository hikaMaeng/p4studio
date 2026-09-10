#!/usr/bin/env sh
set -eu

target="${1:-test/e2e}"
mkdir -p "$target/tests"

config="$target/playwright.config.ts"
spec="$target/tests/smoke.spec.ts"

if [ -e "$config" ] || [ -e "$spec" ]; then
  echo "refusing to overwrite existing files under $target"
  exit 1
fi

cat >"$config" <<'EOF'
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: (() => {
      const url = process.env.E2E_BASE_URL;
      if (!url) throw new Error("E2E_BASE_URL is required: point it at the deployed service");
      return url;
    })(),
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
EOF

cat >"$spec" <<'EOF'
import { expect, test } from "@playwright/test";

test.describe("web smoke", () => {
  test("renders the app shell", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("main")).toBeVisible();
    // TODO: Replace this with the most important user-visible heading or status.
    await expect(page.getByText("<visible text>")).toBeVisible();
  });

  test("performs the primary user path", async ({ page }) => {
    await page.goto("/");

    // TODO: Fill these steps with role/name, label, or text locators.
    // await page.getByRole("link", { name: "<navigation label>" }).click();
    // await page.getByLabel("<field label>").fill("<value>");
    // await page.getByRole("button", { name: "<submit label>" }).click();
    // await expect(page.getByText("<result text>")).toBeVisible();
  });
});
EOF

echo "created $config"
echo "created $spec"
echo "run with: E2E_BASE_URL=<url> playwright test -c $config"
