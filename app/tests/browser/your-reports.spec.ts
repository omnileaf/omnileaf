import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  expect,
  onPlatform,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

const REPORTS_PAGE = "/settings/about/reports";
const OLDER = Date.UTC(2026, 9, 14, 9, 30);
const NEWER = Date.UTC(2026, 9, 15, 18, 5);

async function keepReports(page: Page): Promise<void> {
  await page.addInitScript(
    (kept) => {
      window.localStorage.setItem("omnileaf.yourReports", kept);
    },
    JSON.stringify([
      { code: "R-2QX9", madeAtMs: NEWER },
      { code: "R-7F3K", madeAtMs: OLDER },
    ]),
  );
}

function reportList(page: Page) {
  return page.getByRole("list", { name: "Your reports" });
}

test.describe("with two reports kept", () => {
  test.beforeEach(async ({ page }) => {
    await keepReports(page);
  });

  test("counts them on About and opens them from there", async ({ page }) => {
    await page.goto("/settings/about");

    const row = page.getByRole("link", { name: /^Your reports/ });
    await expect(row).toContainText("2 sent");
    await row.click();

    await expect(page).toHaveURL(REPORTS_PAGE);
    await expect(
      page.getByRole("heading", { level: 1, name: "Your reports" }),
    ).toBeFocused();
  });

  test("lists each report's code, newest first", async ({ page }) => {
    await page.goto(REPORTS_PAGE);

    const rows = reportList(page).getByRole("listitem");

    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Code R-2QX9");
    await expect(rows.last()).toContainText("Code R-7F3K");
    await expect(
      page.getByText(
        "Each report has a random code kept on this computer; nothing else identifies you.",
      ),
    ).toBeVisible();
  });
});

test("leaves Your reports off About until a report is kept", async ({
  page,
}) => {
  await page.goto("/settings/about");
  await expect(
    page.getByRole("heading", { level: 1, name: "About" }),
  ).toBeVisible();

  await expect(page.getByRole("link", { name: /^Your reports/ })).toHaveCount(
    0,
  );
});

test("says no report is kept yet", async ({ page }) => {
  await page.goto(REPORTS_PAGE);

  await expect(page.getByText("No reports yet.")).toBeVisible();
});

for (const platform of ["android", "ios", "linux"] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`on ${platform}`, () => {
      testOnlyInItsWebview(platform);
      test.use(onPlatform(platform));

      test(`Your reports has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await keepReports(page);
        await page.emulateMedia({ colorScheme });
        await page.goto(REPORTS_PAGE);
        await expect(reportList(page)).toBeVisible();

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });
    });
  }
}
