import type { Page } from "@playwright/test";

import { CommandFailure } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
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

const SENT_REPORTS = [
  { code: "R-0000-0001", review: { kind: "received" } },
  { code: "R-0000-0002", review: { kind: "reviewing" } },
  { code: "R-0000-0003", review: { kind: "published", issue: 412 } },
  { code: "R-0000-0004", review: { kind: "closed" } },
  { code: "R-0000-0005", review: { kind: "unknown" } },
] as const;

async function keepSentReports(
  page: Page,
  lastReview?: { kind: "published"; issue: number },
): Promise<void> {
  await page.addInitScript(
    (kept) => {
      window.localStorage.setItem("omnileaf.yourReports", kept);
    },
    JSON.stringify([
      ...SENT_REPORTS.map(({ code }, index) => ({
        code,
        madeAtMs: NEWER - index,
        way: "send",
        statusKey: `key-${code}`,
        ...(lastReview === undefined ? {} : { lastReview }),
      })),
      { code: "R-0000-0006", madeAtMs: OLDER, way: "copy" },
      { code: "R-0000-0007", madeAtMs: OLDER - 1, way: "save" },
      { code: "R-0000-0008", madeAtMs: OLDER - 2, way: "github" },
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

test.describe("with sent reports the maintainers have looked at", () => {
  const asked: string[][] = [];

  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      problemReportStatuses: (reports) => {
        asked.push(reports.map(({ code }) => code));
        return SENT_REPORTS.map(({ code, review }) => ({ code, review }));
      },
    },
  });

  test.beforeEach(async ({ page }) => {
    asked.length = 0;
    await keepSentReports(page);
  });

  test("says Answered only beside the reports that were answered", async ({
    page,
  }) => {
    await page.goto(REPORTS_PAGE);

    const rows = reportList(page).getByRole("listitem");

    await expect(rows.nth(2)).toContainText("Answered · code R-0000-0003");
    await expect(rows.nth(3)).toContainText("Answered · code R-0000-0004");
    await expect(rows.nth(0)).toContainText("Code R-0000-0001");
    await expect(rows.nth(1)).toContainText("Code R-0000-0002");
    await expect(rows.nth(4)).toContainText("Code R-0000-0005");
    await expect(rows.nth(5)).toContainText("Code R-0000-0006");
    await expect(rows.nth(6)).toContainText("Code R-0000-0007");
    await expect(rows.nth(7)).toContainText("Code R-0000-0008");
    expect(asked).toEqual([SENT_REPORTS.map(({ code }) => code)]);
  });
});

test.describe("when the answers can't be fetched", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      problemReportStatuses: () => {
        throw new CommandFailure({
          code: "relayUnreachable",
          message: "the report could not reach Omnileaf",
        });
      },
    },
  });

  test("keeps the last answer it heard", async ({ page }) => {
    await keepSentReports(page, { kind: "published", issue: 412 });

    await page.goto(REPORTS_PAGE);

    await expect(reportList(page).getByRole("listitem").first()).toContainText(
      "Answered · code R-0000-0001",
    );
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
        await keepSentReports(page, { kind: "published", issue: 412 });
        await page.emulateMedia({ colorScheme });
        await page.goto(REPORTS_PAGE);
        await expect(reportList(page)).toBeVisible();

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });
    });
  }
}
