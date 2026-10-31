import type { SeriesDetails } from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const DETAILS = {
  title: { fromFile: SERIES_TITLE, source: "folderName", edited: null },
  people: { fromFile: [], edited: null },
  tags: { fromFile: [], edited: null },
  summary: { fromFile: "", edited: null },
  year: null,
  language: null,
  isMarkedAdult: false,
  isRatedAdult: false,
} satisfies SeriesDetails;

const shelf = new FakeShelf([{ state: "notStarted" }]);

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    keepsDetailEdits: () => true,
    seriesDetails: () => DETAILS,
  },
});

test.describe("Edit details on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's top app bar");
  });

  async function open(page: import("@playwright/test").Page) {
    await page.goto(`/series/${SERIES_ID}`);
    await page
      .getByRole("button", { name: `More for ${SERIES_TITLE}`, exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Edit details…" }).click();
    await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible();
  }

  test("sets Save as an accent text button with no fill", async ({ page }) => {
    await open(page);
    const save = page.getByRole("button", { name: "Save" });

    await expect(save).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(save).toHaveCSS(
      "color",
      await tokenColour(page, "--native-color-on-button-plain"),
    );
    await expect(save).toHaveCSS("font-size", "14px");
    await expect(save).toHaveCSS("font-weight", "500");
  });

  test("sets the title at 22px on a 28px line beside a 48px close button", async ({
    page,
  }) => {
    await open(page);
    const title = page.getByRole("heading", { name: "Edit details" });
    const close = page.getByRole("button", { name: "Close" });

    await expect(title).toHaveCSS("font-size", "22px");
    await expect(title).toHaveCSS("line-height", "28px");
    await expect(title).toHaveCSS("font-weight", "400");
    expect(await boxOf(close)).toMatchObject({ width: 48, height: 48 });
  });
});
