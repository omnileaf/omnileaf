import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, fakeAppInfo, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { openViewOptions } from "./view-options.ts";

const LIBRARY = sampleSeries(6).map((one) => ({ ...one, bookCount: 3 }));
const LINUX_VIEW_OPTIONS_WIDTH = 400;

let storedView: LibraryView = DEFAULT_LIBRARY_VIEW;

const BACKEND = {
  ...DEFAULT_BACKEND,
  librarySeries: pagedSeries(() => LIBRARY),
  librarySeriesCount: () => LIBRARY.length,
  libraryView: () => storedView,
  setLibraryView: (view) => {
    storedView = view;
    return null;
  },
} satisfies FakeBackend;

test.beforeEach(() => {
  storedView = DEFAULT_LIBRARY_VIEW;
});

function stackSwitch(options: Locator): Locator {
  return options.getByRole("switch", { name: "Stack series covers" });
}

function sheets(page: Page): Locator {
  return page
    .getByRole("list", { name: "Series" })
    .locator('[data-slot="cover-sheet"]');
}

test.describe("on linux", () => {
  test.use({ backend: BACKEND });

  test("offers stacked covers as a switch, on to start with", async ({
    page,
  }) => {
    await page.goto("/");
    const options = await openViewOptions(page);

    await expect(stackSwitch(options)).toBeChecked();
    await expect(stackSwitch(options)).toHaveAccessibleDescription(
      "A series with more than one book shows its covers stacked.",
    );
  });

  test("flattens the covers behind at once and keeps the choice", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(sheets(page).first()).toBeVisible();
    const options = await openViewOptions(page);

    await stackSwitch(options).click();

    await expect(sheets(page)).toHaveCount(0);
    await expect.poll(() => storedView.stacksSeriesCovers).toBe(false);
  });

  test("keeps the view options 400 wide, with Group by on its own line", async ({
    page,
  }) => {
    await page.goto("/");
    const options = await openViewOptions(page);
    const groupBy = options.getByRole("radiogroup", { name: "Group by" });
    const label = options.getByText("Group by", { exact: true });

    const panel = await options.boundingBox();
    const control = await groupBy.boundingBox();
    const heading = await label.boundingBox();

    expect(panel?.width).toBe(LINUX_VIEW_OPTIONS_WIDTH);
    expect(control?.y).toBeGreaterThanOrEqual(
      (heading?.y ?? 0) + (heading?.height ?? 0),
    );
    for (const radio of await groupBy.getByRole("radio").all()) {
      await expect(radio).toBeInViewport({ ratio: 1 });
    }
  });
});

test.describe("on macOS", () => {
  test.use({ backend: { ...BACKEND, appInfo: () => fakeAppInfo("macos") } });

  test("leaves the stacking switch out, since its covers stay flat", async ({
    page,
  }) => {
    await page.goto("/");
    const options = await openViewOptions(page);

    await expect(
      options.getByRole("radiogroup", { name: "Group by" }),
    ).toBeVisible();
    await expect(stackSwitch(options)).toHaveCount(0);
  });
});
