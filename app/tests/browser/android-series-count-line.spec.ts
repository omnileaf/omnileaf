import type { Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import { expect, test } from "./fixtures.ts";
import { sampleLibraryOn, serveSampleArt } from "./screens.ts";
import {
  choose,
  openViewOptions,
  VIEW_WITH_COUNTS_UNDER_COVERS,
} from "./view-options.ts";

const COUNTS_SWITCH = "Volumes and chapters";

let storedView: LibraryView = DEFAULT_LIBRARY_VIEW;

function seriesTile(page: Page, title: string) {
  return page
    .getByRole("list", { name: "Series" })
    .getByRole("listitem")
    .filter({ hasText: title });
}

test.describe(
  "The count under each series name on Android",
  { tag: "@native" },
  () => {
    test.use({
      backend: {
        ...sampleLibraryOn("android"),
        libraryView: () => storedView,
        setLibraryView: (view) => {
          storedView = view;
          return null;
        },
      },
    });

    test.beforeEach(async ({ page, platform }) => {
      test.skip(platform !== "android", "Android counts volumes and chapters");
      storedView = DEFAULT_LIBRARY_VIEW;
      await serveSampleArt(page);
    });

    test("counts volumes and chapters as the folder has them", async ({
      page,
    }) => {
      storedView = VIEW_WITH_COUNTS_UNDER_COVERS;
      await page.goto("/");

      await expect(seriesTile(page, "Sample Series 01")).toContainText(
        "12 volumes",
      );
      await expect(seriesTile(page, "Sample Series 11")).toContainText(
        "154 chapters",
      );
      await expect(seriesTile(page, "Sample Series 01")).not.toContainText(
        "books",
      );
    });

    test("draws only each series' title under its cover until the option is on", async ({
      page,
    }) => {
      await page.goto("/");

      await expect(seriesTile(page, "Sample Series 01")).toContainText(
        "Sample Series 01",
      );
      await expect(seriesTile(page, "Sample Series 01")).not.toContainText(
        "volumes",
      );
      await expect(seriesTile(page, "Sample Series 11")).not.toContainText(
        "chapters",
      );
      const options = await openViewOptions(page);
      await expect(
        options.getByRole("switch", { name: COUNTS_SWITCH }),
      ).not.toBeChecked();
    });

    test("draws the counts under the covers once View options turns them on, and keeps them after a reload", async ({
      page,
    }) => {
      await page.goto("/");
      const options = await openViewOptions(page);

      await choose(options, COUNTS_SWITCH);

      await expect(seriesTile(page, "Sample Series 01")).toContainText(
        "12 volumes",
      );
      await page.reload();
      await expect(seriesTile(page, "Sample Series 01")).toContainText(
        "12 volumes",
      );
    });

    for (const [state, view] of [
      ["off", DEFAULT_LIBRARY_VIEW],
      ["on", VIEW_WITH_COUNTS_UNDER_COVERS],
    ] as const) {
      test(`keeps the counts in each list row while the option is ${state}`, async ({
        page,
      }) => {
        storedView = { ...view, display: "list" };
        await page.goto("/");

        await expect(seriesTile(page, "Sample Series 01")).toContainText(
          "12 volumes",
        );
      });
    }
  },
);
