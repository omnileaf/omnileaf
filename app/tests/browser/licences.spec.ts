import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import javascript from "../../src/lib/licences/javascript.json" with { type: "json" };
import {
  groupByLicence,
  licensedPackages,
} from "../../src/lib/licences/licences.ts";
import rust from "../../src/lib/licences/rust.json" with { type: "json" };
import type { Platform } from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

const LICENCES_PAGE = "/settings/about/licences";
const PACKAGES = licensedPackages({ rust, javascript });
const GROUPS = groupByLicence(PACKAGES, new Intl.Collator("en"));
const PREVIEW_SIZE = 3;
const PHONE_ROW_HEIGHT = 60;
const PANE_PACKAGE_TEXT = "14px";
const SMALL_PHONE = { width: 360, height: 800 };
const BREAK_OPPORTUNITY = /[\s/-]/;
const LONGEST_UNBROKEN = PACKAGES.filter(
  (licensed) => !BREAK_OPPORTUNITY.test(licensed.name),
).reduce((longest, licensed) =>
  licensed.name.length > longest.name.length ? licensed : longest,
);

function groupSection(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

async function openLicences(page: Page): Promise<void> {
  await page.goto(LICENCES_PAGE);
  await expect(
    page.getByRole("heading", { level: 1, name: "Open-source licences" }),
  ).toBeVisible();
}

const [MOST_USED] = GROUPS;
if (MOST_USED === undefined) {
  throw new Error("the app ships no licensed packages");
}

test("opens the licences from About", async ({ page }) => {
  await page.goto("/settings/about");

  await page.getByRole("link", { name: /^Open-source licences/ }).click();

  await expect(page).toHaveURL(LICENCES_PAGE);
  await expect(
    page.getByRole("heading", { level: 1, name: "Open-source licences" }),
  ).toBeFocused();
});

test("counts every package the app is built with", async ({ page }) => {
  await openLicences(page);

  await expect(
    page.getByText(
      `Omnileaf is built with ${PACKAGES.length.toLocaleString("en-US")} open-source packages, grouped by licence. Open one to read its licence.`,
    ),
  ).toBeVisible();
});

test("groups the packages by licence, the most used first", async ({
  page,
}) => {
  await openLicences(page);

  const headings = page.getByRole("heading", { level: 2 });

  await expect(headings).toHaveCount(GROUPS.length);
  await expect(headings.first()).toHaveText(MOST_USED.name);
  await expect(groupSection(page, MOST_USED.name)).toContainText(
    `${String(MOST_USED.packages.length)} packages`,
  );
});

test("shows all of a group's packages when asked", async ({ page }) => {
  await openLicences(page);
  const group = groupSection(page, MOST_USED.name);

  await group
    .getByRole("button", {
      name: `Show all ${String(MOST_USED.packages.length)}`,
    })
    .click();

  await expect(group.getByRole("link")).toHaveCount(MOST_USED.packages.length);
  await expect(group.getByRole("link").nth(PREVIEW_SIZE)).toBeFocused();
});

test("opens a package's licence text", async ({ page }) => {
  const [licensed] = MOST_USED.packages;
  const [text] = licensed?.texts ?? [];
  if (licensed === undefined || text === undefined) {
    throw new Error("the most used licence has no package with a text");
  }
  await openLicences(page);

  await groupSection(page, MOST_USED.name)
    .getByRole("link", { name: `${licensed.name} ${licensed.version}` })
    .click();

  await expect(
    page.getByRole("heading", { level: 1, name: licensed.name }),
  ).toBeVisible();
  await expect(
    page.getByText(`Version ${licensed.version} · ${licensed.licence}`),
  ).toBeVisible();
  await expect(page.locator("[lang=en][dir=ltr]").first()).toContainText(
    text.text.trim().split("\n")[0] ?? "",
  );
});

test("leads a licence text back to the licences, even beside the sections", async ({
  page,
}) => {
  await openLicences(page);
  await groupSection(page, MOST_USED.name).getByRole("link").first().click();

  await page
    .getByRole("link", { name: "Back to Open-source licences" })
    .click();

  await expect(page).toHaveURL(LICENCES_PAGE);
});

for (const platform of ["android", "ios"] as const) {
  test.describe(`on an ${platform} phone`, () => {
    test.use(onPlatform(platform));

    test("lists the packages on 60px rows and leads back to About", async ({
      page,
    }) => {
      await openLicences(page);
      test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");

      const row = await boxOf(
        groupSection(page, MOST_USED.name).getByRole("link").first(),
      );

      expect(row.height).toBe(PHONE_ROW_HEIGHT);
      await expect(
        page.getByRole("link", { name: "Back to About" }),
      ).toHaveAttribute("href", "/settings/about");
    });

    test.describe("on a small phone", () => {
      test.use({ viewport: SMALL_PHONE });

      test("wraps a long package name with no break inside the screen", async ({
        page,
      }) => {
        await page.goto(`${LICENCES_PAGE}/${LONGEST_UNBROKEN.key}`);

        const title = await boxOf(
          page.getByRole("heading", { level: 1, name: LONGEST_UNBROKEN.name }),
        );

        expect(title.x + title.width).toBeLessThanOrEqual(SMALL_PHONE.width);
      });
    });
  });
}

const PANE_ROWS: readonly { platform: Platform; rowHeight: number }[] = [
  { platform: "android", rowHeight: 48 },
  { platform: "linux", rowHeight: 44 },
];

for (const { platform, rowHeight } of PANE_ROWS) {
  test.describe(`on ${platform} beside the phone width`, () => {
    test.use(onPlatform(platform));

    test(`lists the packages on ${String(rowHeight)}px rows in 14px text`, async ({
      page,
    }) => {
      await openLicences(page);
      test.skip(
        platform === "android" && viewportOf(page).width < MEDIUM_MIN_WIDTH,
        "tablets only",
      );

      const link = groupSection(page, MOST_USED.name).getByRole("link").first();
      const row = await boxOf(link);

      expect(row.height).toBe(rowHeight);
      await expect(link).toHaveCSS("font-size", PANE_PACKAGE_TEXT);
    });
  });
}

for (const platform of ["android", "ios", "linux"] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`on ${platform}`, () => {
      test.use(onPlatform(platform));

      test(`Settings › About › Open-source licences has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await openLicences(page);

        const results = await new AxeBuilder({ page }).analyze();

        expect(results.violations).toEqual([]);
      });

      test(`a licence text has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await openLicences(page);
        await groupSection(page, MOST_USED.name)
          .getByRole("link")
          .first()
          .click();
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          MOST_USED.packages[0]?.name ?? "",
        );

        const results = await new AxeBuilder({ page }).analyze();

        expect(results.violations).toEqual([]);
      });
    });
  }
}
