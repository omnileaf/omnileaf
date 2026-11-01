import type { Locator, Page } from "@playwright/test";

import type { MissingFolder } from "../../src/lib/ipc/bindings.ts";
import {
  accessibilityViolations,
  boxOf,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  targetOf,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);
const TOUCH_TARGET = 44;
const COMICS = {
  folder: {
    id: "5a4d1e00-0000-4000-8002-000000000002",
    kind: "linked",
    name: "Comics",
    location: "/media/Comics",
    isAvailable: false,
  },
  problem: { kind: "missing" },
  hiddenSeries: 41,
  isShownAnyway: false,
} as MissingFolder;

let missing: MissingFolder[] = [];
let shelf = LIBRARY;

function backendOn(platform: "ios" | "android") {
  return {
    ...onPlatform(platform).backend,
    librarySeries: pagedSeries(() => shelf),
    librarySeriesCount: () => shelf.length,
    missingLibraryFolders: () => missing,
    libraryHiddenSeriesCount: () => (missing.length > 0 ? 41 : 0),
  };
}

function attention(page: Page): Locator {
  return page.getByRole("button", { name: /^Needs attention/ });
}

function topBar(page: Page): Locator {
  return page.locator("[data-title-bar]");
}

async function tap(target: Locator): Promise<void> {
  const touch = { pointerType: "touch", pointerId: 7, isPrimary: true };
  await target.dispatchEvent("pointerdown", touch);
  await target.dispatchEvent("pointerup", touch);
  await target.dispatchEvent("click");
}

test.beforeEach(() => {
  missing = [COMICS];
  shelf = LIBRARY;
});

test.describe("Needs attention on an iPhone", () => {
  test.use({ backend: backendOn("ios") });

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "iPads keep the dot");
  });

  test("draws no dot beside the large Library title", async ({ page }) => {
    await page.goto("/");
    await expect(
      topBar(page).getByRole("button", { name: "More" }),
    ).toBeVisible();

    await expect(attention(page)).toHaveCount(1);
    await expect(
      topBar(page).getByRole("button", { name: /^Needs attention/ }),
    ).toHaveCount(1);
  });

  test("shows a warning button in the top bar, named for what it is and how many", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      topBar(page).getByRole("button", { name: /^Needs attention/ }),
    ).toHaveAccessibleName("Needs attention: 1 thing");
  });

  test("counts the things in a red badge", async ({ page }) => {
    await page.goto("/");
    const badge = topBar(page)
      .getByRole("button", { name: /^Needs attention/ })
      .locator("[data-slot=badge]");

    await expect(badge).toHaveText("1");
    await expect(badge).toHaveCSS(
      "background-color",
      await tokenColour(page, "--color-native-bar-badge"),
    );
    await expect(badge).toHaveCSS(
      "color",
      await tokenColour(page, "--color-native-on-bar-badge"),
    );
  });

  test("sits in the glass circle of its neighbours, on the leading side of the bar", async ({
    page,
  }) => {
    await page.goto("/");
    const button = topBar(page).getByRole("button", {
      name: /^Needs attention/,
    });
    const search = topBar(page).getByRole("link", { name: /^Search/ });

    const more = topBar(page).getByRole("button", { name: "More" });
    const buttonBox = await boxOf(button);
    expect(buttonBox.x).toBeLessThan(viewportOf(page).width / 2);
    expect(buttonBox.x).toBeLessThan((await boxOf(search)).x);
    expect(buttonBox.x).toBeLessThan((await boxOf(more)).x);
    await expect(button).toHaveCSS(
      "border-radius",
      await search.evaluate((link) => getComputedStyle(link).borderRadius),
    );
    await expect(button).toHaveCSS(
      "background-color",
      await tokenColour(page, "--color-native-bar-button"),
    );
    await expect(button).toHaveCSS(
      "box-shadow",
      await search.evaluate((link) => getComputedStyle(link).boxShadow),
    );
  });

  test("is a touch target of at least 44 points with a visible focus ring", async ({
    page,
  }) => {
    await page.goto("/");
    const button = topBar(page).getByRole("button", {
      name: /^Needs attention/,
    });

    const target = await targetOf(button);
    expect(target.width).toBeGreaterThanOrEqual(TOUCH_TARGET);
    expect(target.height).toBeGreaterThanOrEqual(TOUCH_TARGET);
    await button.focus();
    await expect(button).toHaveCSS("outline-style", "solid");
  });

  test("takes the warning colour of the board and dims while its list is open", async ({
    page,
  }) => {
    await page.goto("/");
    const button = topBar(page).getByRole("button", {
      name: /^Needs attention/,
    });

    await expect(button).toHaveCSS(
      "color",
      await tokenColour(page, "--warning-foreground"),
    );
    await expect(button).toHaveCSS("opacity", "1");

    await tap(button);

    await expect(topBar(page).locator("[aria-expanded=true]")).toHaveCSS(
      "opacity",
      "0.5",
    );
  });

  test("puts the count 5 points out from the corner of the button", async ({
    page,
  }) => {
    await page.goto("/");
    const badge = topBar(page)
      .getByRole("button", { name: /^Needs attention/ })
      .locator("[data-slot=badge]");

    await expect(badge).toHaveCSS("top", "-5px");
    await expect(badge).toHaveCSS("right", "-5px");
  });

  test("opens the list of what needs attention", async ({ page }) => {
    await page.goto("/");

    await tap(topBar(page).getByRole("button", { name: /^Needs attention/ }));

    const list = page.getByRole("dialog", { name: "Needs attention" });
    await expect(list).toHaveAttribute("data-state", "open");
    await expect(list).toContainText("Comics isn’t there");
  });

  test("stays in the bar when the library is empty", async ({ page }) => {
    shelf = [];
    await page.goto("/");

    await expect(
      topBar(page).getByRole("button", { name: /^Needs attention/ }),
    ).toBeVisible();
    await expect(attention(page)).toHaveCount(1);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`has no accessibility violations with the button in the ${theme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/");
      await expect(
        topBar(page).getByRole("button", { name: /^Needs attention/ }),
      ).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }

  test("goes once nothing needs attention", async ({ page }) => {
    missing = [];
    await page.goto("/");
    await expect(
      topBar(page).getByRole("button", { name: "More" }),
    ).toBeVisible();

    await expect(attention(page)).toHaveCount(0);
  });
});

test.describe("Needs attention on an iPad", () => {
  test.use({ backend: backendOn("ios") });

  test("keeps the dot beside the title", async ({ page }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "an iPad's width");
    await page.goto("/");

    await expect(
      page
        .getByRole("heading", { level: 1, name: "Library" })
        .locator("..")
        .getByRole("button", { name: /^Needs attention/ }),
    ).toBeVisible();
  });
});

test.describe("Needs attention on an Android phone", () => {
  test.use({ backend: backendOn("android") });

  test("keeps the warning button with its count", async ({ page }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "a phone's width");
    await page.goto("/");

    const badge = attention(page).locator("[data-slot=badge]");

    await expect(badge).toHaveText("1");
    await expect(badge).toHaveCSS(
      "background-color",
      await tokenColour(page, "--color-danger-fill"),
    );
    await expect(badge).toHaveCSS("top", "-4px");
  });
});
