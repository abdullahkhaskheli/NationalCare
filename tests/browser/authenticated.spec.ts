import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
const fixturePath = process.env.NC_QA_FIXTURE || "../nc-qa.json";
const sessionPath = "../nc-qa-sessions.json";
test.describe("isolated live authenticated UI", () => {
  test.skip(
    !existsSync(sessionPath),
    "Requires the explicit synthetic live-test fixture.",
  );
  // The execution environment requires its outbound HTTP proxy. Forward actual API
  // responses through Node fetch; these are live requests, never mocked records.
  test.beforeEach(async ({ page }) => {
    if (process.env.HTTPS_PROXY)
      await page.route("https://*.supabase.co/**", async (route) => {
        const req = route.request();
        const response = await fetch(req.url(), {
          method: req.method(),
          headers: req.headers(),
          body: ["GET", "HEAD"].includes(req.method())
            ? undefined
            : req.postDataBuffer(),
        });
        const headers = Object.fromEntries(response.headers);
        delete headers["content-encoding"];
        delete headers["content-length"];
        await route.fulfill({
          status: response.status,
          headers,
          body: Buffer.from(await response.arrayBuffer()),
        });
      });
  });

  test("patient records, photo, prescriptions and PDF are usable", async ({
    page,
  }) => {
    const sessions = JSON.parse(readFileSync(sessionPath, "utf8"));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      (session) =>
        localStorage.setItem(
          "sb-acgrqwqvslzlgircbznx-auth-token",
          JSON.stringify(session),
        ),
      sessions.patient,
    );
    await page.goto("/#workspace/patient/profile");
    await expect(
      page.getByRole("heading", { name: "Automated QA Patient", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".patient-photo img")).toBeVisible();
    await page.goto("/#workspace/patient/prescriptions");
    await expect(page.locator(".rx-card").first()).toContainText(
      "Synthetic QA medicine",
    );
    await expect(
      page
        .locator(".rx-card")
        .filter({ hasText: "Partially dispensed" })
        .first(),
    ).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page
      .locator(".rx-card")
      .first()
      .getByRole("button", { name: /Download/ })
      .click();
    const download = await downloadPromise;
    await download.saveAs("test-results/prescription.pdf");
    await page.screenshot({
      path: "test-results/patient-prescriptions.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
  test("doctor sees only consented patients and authorized workspace", async ({
    page,
  }) => {
    const sessions = JSON.parse(readFileSync(sessionPath, "utf8"));
    await page.addInitScript(
      (session) =>
        localStorage.setItem(
          "sb-acgrqwqvslzlgircbznx-auth-token",
          JSON.stringify(session),
        ),
      sessions.doctor,
    );
    await page.goto("/#workspace/doctor/records");
    await expect(page.locator(".patient-select select")).toBeVisible({
      timeout: 20000,
    });
    const options = page.locator(".patient-select option");
    await expect(options).toHaveCount(2);
    await expect(options.last()).toContainText("Automated QA Patient");
    await page.goto("/#workspace/ministry");
    await expect(
      page.getByRole("heading", {
        name: "This workspace requires an approved role",
      }),
    ).toBeVisible();
  });
});
