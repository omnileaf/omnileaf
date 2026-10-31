import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  literalColour,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const WINDOW = { width: 1280, height: 800 };
const SERIES = sampleSeries(12);

const ON_WINDOWS = {
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => SERIES),
    librarySeriesCount: () => SERIES.length,
    appInfo: () => fakeAppInfo("windows"),
  },
};

function pane(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main" });
}

async function openUnderForcedColours(page: Page, path: string) {
  await page.emulateMedia({ forcedColors: "active" });
  await page.setViewportSize(WINDOW);
  await page.goto(path);
  await expect(page.getByRole("main")).toBeVisible();
}

async function expectHighlighted(page: Page, item: Locator) {
  await expect(item).toHaveCSS(
    "background-color",
    await literalColour(page, "Highlight"),
  );
  await expect(item).toHaveCSS(
    "color",
    await literalColour(page, "HighlightText"),
  );
}

async function expectNotHighlightText(page: Page, text: Locator) {
  await expect(text).not.toHaveCSS(
    "color",
    await literalColour(page, "HighlightText"),
  );
}

test.describe("on Windows under forced colours", () => {
  testOnlyInItsWebview("windows");
  test.use(ON_WINDOWS);

  test("draws the current pane item on Highlight with its text and pill in HighlightText", async ({
    page,
  }) => {
    await openUnderForcedColours(page, "/");
    const library = pane(page).getByRole("link", { name: "Library" });

    const pill = await library.evaluate(
      (link) => getComputedStyle(link, "::before").backgroundColor,
    );

    await expectHighlighted(page, library);
    expect(pill).toBe(await literalColour(page, "HighlightText"));
  });

  test("draws a hovered pane item on Highlight with HighlightText", async ({
    page,
  }) => {
    await openUnderForcedColours(page, "/");
    const browse = pane(page).getByRole("link", { name: "Browse" });

    await browse.hover();

    await expectHighlighted(page, browse);
  });

  test("draws a pressed pane item on Highlight with HighlightText", async ({
    page,
  }) => {
    await openUnderForcedColours(page, "/");
    const history = pane(page).getByRole("link", { name: "History" });
    const box = await boxOf(history);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();

    await expectHighlighted(page, history);
    await page.mouse.up();
  });

  test("draws the current page in the settings list on Highlight with HighlightText", async ({
    page,
  }) => {
    await openUnderForcedColours(page, "/settings/general");

    await expectHighlighted(
      page,
      page
        .getByRole("navigation", { name: "Settings sections" })
        .getByRole("link", { name: "General" }),
    );
  });

  test("keeps a breadcrumb's text off HighlightText, which has no Highlight behind it there", async ({
    page,
  }) => {
    await openUnderForcedColours(page, "/settings/general");
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    const crumb = breadcrumb.getByRole("link", { name: "Settings" });

    await crumb.hover();

    await expectNotHighlightText(page, crumb);
    await expectNotHighlightText(
      page,
      breadcrumb.locator('[aria-current="page"]'),
    );
  });
});
