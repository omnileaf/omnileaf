import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import type { Page, Locator } from "@playwright/test";

test.use({ backend: { ...DEFAULT_BACKEND } });

const TITLE_BAR_HEIGHT = 44;
const LANGUAGE_GAP = 8;
const PERMISSION_ROW_INSET = 12;

interface PageStart {
  readonly route: string;
  readonly first: (page: Page) => Locator;
}

const PAGE_STARTS: readonly PageStart[] = [
  {
    route: "/settings/general",
    first: (page) => page.getByRole("heading", { name: "Omnileaf opens on" }),
  },
  {
    route: "/settings/privacy",
    first: (page) => page.getByRole("link", { name: /Screenshot mode/ }),
  },
  {
    route: "/settings/advanced",
    first: (page) => page.getByRole("link", { name: /Animations/ }),
  },
  {
    route: "/settings/reading",
    first: (page) => page.getByText(/Defaults for every series/),
  },
  {
    route: "/settings/general/language",
    first: (page) => page.getByText(/Each language is shown/),
  },
  {
    route: "/settings/about/licences",
    first: (page) => page.getByText(/Made from the packages/),
  },
  {
    route: "/settings/library/tabs",
    first: (page) => page.locator("p", { hasText: /Drag to reorder/ }),
  },
  {
    route: "/settings/library/adult-content",
    first: (page) => page.getByText(/A series counts as 18\+/),
  },
  {
    route: "/settings/about/report",
    first: (page) => page.getByText(/^Nothing is sent until you choose/),
  },
  {
    route: "/settings/about/reports",
    first: (page) => page.getByText(/^Each report has a random code/),
  },
  {
    route: "/settings/advanced/animations",
    first: (page) => page.getByText(/^All four are on until you turn them off/),
  },
  {
    route: "/settings/library/folders",
    first: (page) =>
      page.getByText(/^Omnileaf reads your files where they are/),
  },
  {
    route: "/settings/privacy/screenshot-mode",
    first: (page) => page.getByText(/^Swaps names and covers for stand-ins/),
  },
  {
    route: "/settings/privacy/permissions",
    first: (page) => page.getByText(/^Omnileaf asks for each one/),
  },
  {
    route: "/settings/storage",
    first: (page) => page.getByRole("region", { name: "On this phone" }),
  },
  {
    route: "/settings/appearance",
    first: (page) => page.getByText("Light or dark", { exact: true }),
  },
  {
    route: "/settings/about",
    first: (page) => page.locator("main img").first(),
  },
];

test.describe(
  "the Settings pages on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list pages");
    });

    for (const { route, first } of PAGE_STARTS) {
      test(`starts ${route} right under its title`, async ({ page }) => {
        await page.goto(route);
        const title = await boxOf(page.getByRole("heading", { level: 1 }));
        const start = await boxOf(first(page).first());

        expect(title.height).toBe(TITLE_BAR_HEIGHT);
        expect(start.y - (title.y + title.height)).toBeCloseTo(0, 0);
      });
    }

    test("starts General's first heading with no padding above it", async ({
      page,
    }) => {
      await page.goto("/settings/general");

      await expect(
        page.getByRole("heading", { name: "Omnileaf opens on" }),
      ).toHaveCSS("padding-top", "0px");
    });

    test("sets General's language row 8px under the radios", async ({
      page,
    }) => {
      await page.goto("/settings/general");
      const radios = await boxOf(
        page.getByRole("radiogroup", { name: "Omnileaf opens on" }),
      );
      const language = await boxOf(
        page.getByRole("button", { name: /Language/ }),
      );

      expect(language.y - (radios.y + radios.height)).toBeCloseTo(
        LANGUAGE_GAP,
        0,
      );
    });

    test("runs Advanced's Undo heading straight on from its rows", async ({
      page,
    }) => {
      await page.goto("/settings/advanced");
      const row = await boxOf(page.getByRole("link", { name: /Animations/ }));
      const heading = await boxOf(page.getByRole("heading", { name: "Undo" }));

      expect(heading.y - (row.y + row.height)).toBeCloseTo(0, 0);
    });

    test("pads a radio row with a hint 4px above and below its words", async ({
      page,
    }) => {
      await page.goto("/settings/library/adult-content");
      const row = page.getByRole("radio", { name: /Show/ });

      await expect(row).toHaveCSS("padding-top", "4px");
      await expect(row).toHaveCSS("padding-bottom", "4px");
    });

    test("tops each permission row 12px in, its icon level with its name", async ({
      page,
    }) => {
      await page.goto("/settings/privacy/permissions");
      const row = page
        .getByRole("list", { name: "Permissions" })
        .getByRole("listitem")
        .filter({ hasText: "Notifications" });
      const rowBox = await boxOf(row);
      const nameBox = await boxOf(
        row.getByText("Notifications", { exact: true }),
      );
      const iconBox = await boxOf(row.locator("[data-icon=bell]"));

      expect(nameBox.y - rowBox.y).toBeCloseTo(PERMISSION_ROW_INSET, 0);
      expect(iconBox.y).toBeCloseTo(nameBox.y, 0);
    });

    test("runs the permissions straight on from their intro", async ({
      page,
    }) => {
      await page.goto("/settings/privacy/permissions");
      const intro = await boxOf(page.getByText(/^Omnileaf asks for each one/));
      const list = await boxOf(page.getByRole("list", { name: "Permissions" }));

      expect(list.y - (intro.y + intro.height)).toBeCloseTo(0, 0);
    });

    test("says About's report is built on this phone", async ({ page }) => {
      await page.goto("/settings/about");

      await expect(page.getByText(/^Builds a report on this/)).toHaveText(
        "Builds a report on this phone; you choose where it goes",
      );
    });
  },
);
