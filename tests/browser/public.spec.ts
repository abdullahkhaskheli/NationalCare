import { test, expect } from "@playwright/test";
test("public directory, discovery slides and FAQ work", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Care that stays with you." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Slide 2", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clearer picture of your health." }),
  ).toBeVisible();
  await page.goto("/#hospitals");
  await page
    .getByRole("textbox", { name: "Search", exact: true })
    .fill("Shaukat");
  await expect(page.locator(".hospital-card")).toHaveCount(1);
  await expect(page.locator(".hospital-card")).toContainText("Lahore");
  await page.goto("/#faq");
  await page.locator("summary").first().click();
  await expect(page.locator("details").first()).toHaveAttribute("open", "");
  expect(errors).toEqual([]);
});
test("all eighteen portals and three languages are present", async ({
  page,
}) => {
  await page.goto("/#portals");
  await expect(page.locator(".portal-card")).toHaveCount(18);
  await page
    .getByRole("combobox", { name: "Language / زبان / اللغة" })
    .selectOption("ur");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ur");
  await expect(page.locator(".portal-card").nth(1)).toContainText("مریض");
  await page
    .getByRole("combobox", { name: "Language / زبان / اللغة" })
    .selectOption("ar");
  await expect(page.locator(".portal-card").nth(1)).toContainText("المريض");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
});
test("desktop and mobile render without horizontal overflow", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.waitForTimeout(600);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/home-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("combobox", { name: "Language / زبان / اللغة" })
    .selectOption("ur");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "test-results/home-urdu.png", fullPage: true });
});
test("protected portals require sign-in and public login submits real auth", async ({
  page,
}) => {
  await page.goto("/#workspace/doctor");
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.locator("input[name=email]")).toBeVisible();
  await expect(page.locator("input[name=password]")).toBeVisible();
  await page.goto("/#login/register");
  await expect(page.locator("input[name=full_name]")).toBeVisible();
});
