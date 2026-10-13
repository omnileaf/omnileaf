import { expect, test } from "@playwright/test";

const SECURITY_TXT = `Contact: mailto:security@omnileaf.app
Expires: 2027-10-13T00:00:00.000Z
Preferred-Languages: en
Canonical: https://omnileaf.app/.well-known/security.txt
Policy: https://omnileaf.app/#security
`;

const OVERCLAIMS = /\b(sandboxed|audited|certified|compliant)\b/i;

test("opens on the security section from its link", async ({ page }) => {
  await page.goto("/#security");

  const security = page.getByRole("region", { name: "Security" });

  await expect(security).toBeInViewport();
});

test("names the security lead and the security contact", async ({ page }) => {
  await page.goto("/");

  const security = page.getByRole("region", { name: "Security" });

  await expect(security).toContainText("Kaiser Bh");
  await expect(security).toContainText("Security Lead, Omnileaf Pty Ltd");
  await expect(
    security.getByRole("link", { name: "security@omnileaf.app" }).first(),
  ).toHaveAttribute("href", "mailto:security@omnileaf.app");
});

test("says how to report a vulnerability", async ({ page }) => {
  await page.goto("/");

  const security = page.getByRole("region", { name: "Security" });

  await expect(security).toContainText(
    "We acknowledge reports within 3 business days and follow coordinated disclosure.",
  );
});

test("makes no claim of outside assurance", async ({ page }) => {
  await page.goto("/");

  const text = await page.locator("body").innerText();

  expect(text).not.toMatch(OVERCLAIMS);
});

test("serves security.txt as plain text", async ({ request }) => {
  const response = await request.get("/.well-known/security.txt");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
  expect(await response.text()).toBe(SECURITY_TXT);
});
