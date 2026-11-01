import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(4);

testOnlyInItsWebview("linux");
test.use({
  platform: "linux",
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

test("keeps the ring on a picked cover and a plain title", async ({ page }) => {
  await page.goto("/");
  await expect(covers(page).getByRole("listitem")).toHaveCount(LIBRARY.length);

  await covers(page)
    .getByRole("link")
    .nth(0)
    .click({ modifiers: ["ControlOrMeta"] });

  const checkbox = covers(page).getByRole("checkbox").nth(0);
  await expect(checkbox.locator("> div").first()).toHaveCSS(
    "outline-width",
    "2px",
  );
  await expect(checkbox.locator("p").first()).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
});

test("has no Remove from library in a series' menu", async ({ page }) => {
  await page.goto("/");
  await covers(page).getByRole("link").nth(0).click({ button: "right" });

  await expect(
    page.getByRole("menuitem", { name: /Remove from library/ }),
  ).toHaveCount(0);
});
