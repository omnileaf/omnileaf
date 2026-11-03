import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, type Response, test } from "@playwright/test";

import { sidewaysOverflow } from "../browser/sideways-overflow.ts";

const REPLY_ADDRESS = "reporter-reply@example.test";
const MIN_TARGET_PIXELS = 44;
const MIN_OUTLINE_PIXELS = 2;
const CONTROLS = "a[href], button, select, input:not([type=hidden]), textarea";
const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

const PUBLISHED = "R-0A5C-J6VN";
const RECEIVED = "R-8M4T-K2QX";
const PURGED = "R-7E9S-M3TY";

interface DashboardPage {
  readonly name: string;
  readonly status: number;
  readonly open: (page: Page) => Promise<Response | null>;
}

const SIGNED_IN_PAGES: readonly DashboardPage[] = [
  {
    name: "report list",
    status: 200,
    open: (page) => page.goto("/admin"),
  },
  {
    name: "filtered list",
    status: 200,
    open: (page) => page.goto("/admin?status=published&platform=ios"),
  },
  {
    name: "empty list",
    status: 200,
    open: (page) => page.goto("/admin?status=duplicate"),
  },
  {
    name: "report with an audit trail",
    status: 200,
    open: (page) => page.goto(`/admin/reports/${PUBLISHED}`),
  },
  {
    name: "report with no status changes",
    status: 200,
    open: (page) => page.goto(`/admin/reports/${RECEIVED}`),
  },
  {
    name: "report with purged text",
    status: 200,
    open: (page) => page.goto(`/admin/reports/${PURGED}`),
  },
  {
    name: "audit trail",
    status: 200,
    open: (page) => page.goto(`/admin/reports/${PUBLISHED}/audit`),
  },
  {
    name: "refusal after a refused status change",
    status: 409,
    open: async (page) => {
      await page.goto(`/admin/reports/${PUBLISHED}`);
      const refused = page.waitForResponse(
        (response) => response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Reviewing" }).click();
      return refused;
    },
  },
  {
    name: "issue text",
    status: 200,
    open: (page) => page.goto(`/admin/reports/${RECEIVED}/issue`),
  },
  {
    name: "nothing to copy",
    status: 410,
    open: (page) => page.goto(`/admin/reports/${PURGED}/issue`),
  },
  {
    name: "no such report",
    status: 404,
    open: (page) => page.goto("/admin/reports/R-2222-2222"),
  },
];

async function signIn(page: Page, login: string): Promise<Response | null> {
  const started = await page.request.get("/admin/login", { maxRedirects: 0 });
  const target = new URL(started.headers()["location"] ?? "");
  const state = target.searchParams.get("state") ?? "";
  return page.goto(
    `/admin/auth/callback?code=code-for-${login}&state=${state}`,
  );
}

async function checkPage(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations, "axe violations").toEqual([]);
  expect(await sidewaysOverflow(page, "body"), "sideways overflow").toEqual([]);
  expect(await page.content(), "reply address in the page").not.toContain(
    REPLY_ADDRESS,
  );
  expect(
    await page.locator("body").innerText(),
    "reply address in the text",
  ).not.toContain(REPLY_ADDRESS);
}

async function smallTargets(page: Page): Promise<string[]> {
  return page.locator(CONTROLS).evaluateAll(
    (controls, minimum) =>
      controls.flatMap((control) => {
        const { width, height } = control.getBoundingClientRect();
        return width < minimum || height < minimum
          ? [
              `${control.outerHTML.slice(0, 80)} is ${String(width)}x${String(height)}`,
            ]
          : [];
      }),
    MIN_TARGET_PIXELS,
  );
}

async function controlsWithoutFocusRing(page: Page): Promise<string[]> {
  const count = await page.locator(CONTROLS).count();
  const missing: string[] = [];
  for (let visited = 0; visited < count; visited += 1) {
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null) {
        return null;
      }
      const style = getComputedStyle(active);
      return {
        control: active.outerHTML.slice(0, 80),
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth),
        color: style.outlineColor,
      };
    });
    if (
      ring === null ||
      ring.style === "none" ||
      ring.width < MIN_OUTLINE_PIXELS ||
      ring.color === "rgba(0, 0, 0, 0)"
    ) {
      missing.push(ring === null ? "nothing has focus" : ring.control);
    }
  }
  return missing;
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test("the sign-in refusal page is accessible", async ({ page }) => {
      const response = await signIn(page, "stranger");

      expect(response?.status()).toBe(403);
      await checkPage(page);
      expect(await smallTargets(page)).toEqual([]);
      expect(await controlsWithoutFocusRing(page)).toEqual([]);
    });

    for (const dashboardPage of SIGNED_IN_PAGES) {
      test(`the ${dashboardPage.name} is accessible`, async ({ page }) => {
        const signedIn = await signIn(page, "reviewer");
        expect(signedIn?.status()).toBe(200);

        const response = await dashboardPage.open(page);

        expect(response?.status()).toBe(dashboardPage.status);
        await checkPage(page);
        expect(await smallTargets(page)).toEqual([]);
        expect(await controlsWithoutFocusRing(page)).toEqual([]);
      });
    }
  });
}
