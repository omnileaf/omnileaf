import type { LibraryFolder } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { boxOf, expect, onPlatform, test, viewportOf } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);
const GROUP_HEAD_GAP = 16;
const GROUP_GAP = 40;
const CHEVRON_END_GAP = 4;
const FOLDER = {
  id: "comics-folder",
  kind: "linked",
  name: "Comics",
  location: "/media/Comics",
  isAvailable: true,
} as LibraryFolder;

test.use({
  backend: {
    ...onPlatform("ios").backend,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    libraryFolders: () => ({ folders: [FOLDER], next: null }),
    folderSeries: (_folder, after, listing) =>
      pagedSeries(() => LIBRARY)(after, listing),
    folderSeriesCount: () => LIBRARY.length,
    libraryView: () => ({ ...DEFAULT_LIBRARY_VIEW, groupBy: "folder" }),
  },
});

test("sets a group's heading as a 20px title at weight 590 with the count in footnote type", async ({
  page,
}) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "Comics", exact: true });
  const heading = section.getByRole("heading", { level: 2 });

  await expect(heading).toHaveCSS("font-size", "20px");
  await expect(heading).toHaveCSS("line-height", "25px");
  await expect(heading).toHaveCSS("font-weight", "590");
  await expect(heading).toHaveCSS("letter-spacing", "-0.45px");
  await expect(section.getByText("6 series")).toHaveCSS("font-size", "13px");
});

test.describe("on android", () => {
  test.use({
    backend: {
      ...onPlatform("android").backend,
      librarySeries: pagedSeries(() => LIBRARY),
      librarySeriesCount: () => LIBRARY.length,
      libraryFolders: () => ({ folders: [FOLDER], next: null }),
      folderSeries: (_folder, after, listing) =>
        pagedSeries(() => LIBRARY)(after, listing),
      folderSeriesCount: () => LIBRARY.length,
      libraryView: () => ({ ...DEFAULT_LIBRARY_VIEW, groupBy: "folder" }),
    },
  });

  test("sets a group's heading in Material title type", async ({ page }) => {
    await page.goto("/");
    const heading = page
      .getByRole("region", { name: "Comics", exact: true })
      .getByRole("heading", { level: 2 });

    await expect(heading).toHaveCSS("font-size", "16px");
    await expect(heading).toHaveCSS("line-height", "24px");
    await expect(heading).toHaveCSS("font-weight", "500");
    await expect(heading).toHaveCSS("letter-spacing", "0.15px");
  });

  test("names no grouping under the Library title when grouped by folder", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("main").getByText("6 series", { exact: true }),
    ).toHaveCount(2);
    await expect(page.getByText(/· by /)).toHaveCount(0);
  });
});

const WRITTEN = LIBRARY.slice(0, 3);
const GROUPED_BY_WRITER: FakeBackend = {
  ...onPlatform("android").backend,
  librarySeries: pagedSeries(() => LIBRARY),
  librarySeriesCount: () => LIBRARY.length,
  libraryWriters: () => ({
    writers: [{ name: "Author A", seriesCount: WRITTEN.length }],
    next: null,
  }),
  writerSeries: (_writer, after, listing) =>
    pagedSeries(() => WRITTEN)(after, listing),
  writerSeriesCount: () => WRITTEN.length,
  writerlessSeries: pagedSeries(() => LIBRARY.slice(3)),
  writerlessSeriesCount: () => LIBRARY.length - WRITTEN.length,
  libraryView: () => ({ ...DEFAULT_LIBRARY_VIEW, groupBy: "creator" }),
};

test.describe(
  "a writer's group on an Android phone",
  { tag: "@native" },
  () => {
    test.use({ backend: GROUPED_BY_WRITER });

    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's Material group heading");
    });

    test("stacks the writer's name over the count in Material body type", async ({
      page,
    }) => {
      await page.goto("/");
      const section = page.getByRole("region", { name: "Author A" });
      const heading = section.getByRole("heading", { level: 2 });
      const count = section.getByText("3 series", { exact: true });

      await expect(count).toHaveCSS("font-size", "14px");
      await expect(count).toHaveCSS("line-height", "20px");
      await expect(count).toHaveCSS("letter-spacing", "0.25px");
      const headingBox = await boxOf(heading);
      const countBox = await boxOf(count);
      expect(countBox.y).toBeCloseTo(headingBox.y + headingBox.height, 0);
      expect(countBox.x).toBeCloseTo(headingBox.x, 0);
    });

    test("opens the writer's page from a chevron link 4px from the edge", async ({
      page,
    }) => {
      await page.goto("/");
      const open = page
        .getByRole("region", { name: "Author A" })
        .getByRole("link", { name: "Open Author A" });

      const box = await boxOf(open);
      expect(viewportOf(page).width - (box.x + box.width)).toBeCloseTo(
        CHEVRON_END_GAP,
        0,
      );
      await expect(open.locator("[data-icon='chevron-right']")).toBeVisible();
      await open.click();

      await expect(page).toHaveURL(/\/creator\/Author%20A$/);
    });

    test("says the library is grouped by creator under its title", async ({
      page,
    }) => {
      await page.goto("/");

      await expect(
        page
          .getByRole("main")
          .getByText("6 series · by creator", { exact: true }),
      ).toBeVisible();
    });

    test("sets the covers 16px under the count and the next group 40px under the covers", async ({
      page,
    }) => {
      await page.goto("/");
      const section = page.getByRole("region", { name: "Author A" });
      const count = await boxOf(section.getByText("3 series", { exact: true }));
      const covers = section.getByRole("listitem");
      const first = await boxOf(covers.first());
      const last = await boxOf(covers.last());
      const next = await boxOf(
        page
          .getByRole("region", { name: "No creator in the files" })
          .getByRole("heading", { level: 2 }),
      );

      expect(first.y - (count.y + count.height)).toBeCloseTo(GROUP_HEAD_GAP, 0);
      expect(next.y - (last.y + last.height)).toBeCloseTo(GROUP_GAP, 0);
    });

    test.describe("with series hidden", () => {
      test.use({
        backend: { ...GROUPED_BY_WRITER, libraryHiddenSeriesCount: () => 2 },
      });

      test("names the grouping after the hidden series", async ({ page }) => {
        await page.goto("/");

        await expect(
          page.getByRole("main").getByText("6 series · 2 hidden · by creator", {
            exact: true,
          }),
        ).toBeVisible();
      });
    });

    test("turns the chevron to face the end in a right-to-left layout", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
      await page.evaluate(() => {
        document.documentElement.dir = "rtl";
      });

      await expect(
        page
          .getByRole("link", { name: "Open Author A" })
          .locator("[data-icon='chevron-right']"),
      ).toHaveCSS("scale", "-1 1");
    });

    test("gives the series naming nobody no chevron", async ({ page }) => {
      await page.goto("/");

      await expect(
        page
          .getByRole("region", { name: "No creator in the files" })
          .getByRole("link", { name: /^Open/ }),
      ).toHaveCount(0);
    });
  },
);
