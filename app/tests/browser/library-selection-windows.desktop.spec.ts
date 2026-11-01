import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(4);

testOnlyInItsWebview("windows");
test.use({
  platform: "windows",
  viewport: { width: 1280, height: 800 },
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: [...LIBRARY], next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

function covers(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

test("keeps a plain title on a picked cover", async ({ page }) => {
  await page.goto("/");
  await expect(covers(page).getByRole("listitem")).toHaveCount(LIBRARY.length);

  await covers(page)
    .getByRole("link")
    .nth(0)
    .click({ modifiers: ["ControlOrMeta"] });

  await expect(
    covers(page).getByRole("checkbox").nth(0).locator("p").first(),
  ).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("keeps Select in a series' menu", async ({ page }) => {
  await page.goto("/");
  await covers(page).getByRole("link").nth(0).click({ button: "right" });

  await expect(page.getByRole("menuitem", { name: "Select" })).toBeVisible();
});

test("rings the right-clicked cover in the neutral border colour", async ({
  page,
}) => {
  await page.goto("/");
  const link = covers(page).getByRole("link").nth(0);
  await link.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();

  const ring = link.locator("> div").first();
  await expect(ring).toHaveCSS("outline-width", "2px");
  await expect(ring).toHaveCSS("outline-offset", "2px");
});

test("opens the series on a plain click instead of selecting it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(covers(page).getByRole("listitem")).toHaveCount(LIBRARY.length);

  await covers(page).getByRole("link").nth(1).click();

  await expect(page).toHaveURL(new RegExp(`/series/${LIBRARY[1]?.id ?? ""}$`));
});
