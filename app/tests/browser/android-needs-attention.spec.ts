import type { MissingFolder } from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    missingLibraryFolders: () =>
      [
        {
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
        },
      ] as MissingFolder[],
    libraryHiddenSeriesCount: () => 41,
  },
});

test.describe("Needs attention on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's top app bar");
  });

  test("sits in the top app bar as a warning button with a red count, before Search", async ({
    page,
  }) => {
    await page.goto("/");
    const button = page.getByRole("button", { name: /need.*attention/i });
    const search = page.getByRole("link", { name: /^Search/ });
    const badge = button.locator("[data-slot=badge]");

    await expect(badge).toHaveText("1");
    expect((await boxOf(button)).x).toBeLessThan((await boxOf(search)).x);
    await expect(badge).toHaveCSS(
      "background-color",
      await tokenColour(page, "--color-danger"),
    );
  });

  test("opens the list of what needs attention in a sheet", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /need.*attention/i }).click();

    await expect(
      page.getByRole("dialog", { name: /Needs attention/i }),
    ).toBeVisible();
  });

  test("sets the sheet's problems as flat two-line rows with a tonal fix button and no badge on the title", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /need.*attention/i }).click();
    const sheet = page.getByRole("dialog", { name: /Needs attention/i });
    const title = sheet.getByText("Comics isn’t there");
    const fix = sheet.getByRole("button", { name: "Find it" });

    await expect(title).toHaveCSS("font-weight", "400");
    await expect(title).toHaveCSS("font-size", "16px");
    await expect(sheet.getByRole("list")).toHaveCSS("border-top-width", "0px");
    await expect(fix).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-accent-soft"),
    );
    await expect(sheet.locator("span.bg-chip")).toBeHidden();
  });
});
