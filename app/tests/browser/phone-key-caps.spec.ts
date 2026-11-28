import type { Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { SectionShelf, volumes } from "./series-sections-shelf.ts";
import { SERIES_ID } from "./series-shelf.ts";

const shelf = new SectionShelf(volumes(1, 2));

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
  },
});

function selectionBar(page: Page): Locator {
  return page.getByRole("group", { name: "Selected books" });
}

function escapeKeyCap(page: Page): Locator {
  return selectionBar(page).locator("kbd:visible");
}

async function pickFirstCover(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  const first = page
    .getByRole("list", { name: "Volumes" })
    .getByRole("listitem")
    .first()
    .getByRole("link")
    .first();
  await first.focus();
  await page.keyboard.press("Space");
  await expect(selectionBar(page)).toBeVisible();
}

test.describe("the Escape key cap in a series' selection bar", () => {
  test.use({
    platform: async ({ isMobile }, use) => {
      await use(isMobile ? "ios" : "linux");
    },
  });

  test.describe("with only touch", () => {
    test.use({ hasTouch: true });

    test("shows no key cap", async ({ page }) => {
      await pickFirstCover(page);

      await expect(escapeKeyCap(page)).toHaveCount(0);
      await expect(
        selectionBar(page).getByRole("button", {
          name: "Clear the selection",
          exact: true,
        }),
      ).toBeVisible();
    });
  });

  test.describe("with a mouse or trackpad", () => {
    test.use({ hasTouch: false });

    test("shows the Esc key cap", async ({ page }) => {
      await pickFirstCover(page);

      await expect(escapeKeyCap(page)).toHaveText("Esc");
    });

    test("drops the key cap once only touch is left", async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== "chromium", "touch through DevTools");
      await pickFirstCover(page);
      await expect(escapeKeyCap(page)).toHaveText("Esc");
      const session = await page.context().newCDPSession(page);

      await session.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 1,
      });

      await expect(escapeKeyCap(page)).toHaveCount(0);
    });
  });
});
