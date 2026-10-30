import type { LibraryFolder } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import { expect, onPlatform, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);
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

  test("keeps a group's heading bold in lead type", async ({ page }) => {
    await page.goto("/");
    const heading = page
      .getByRole("region", { name: "Comics", exact: true })
      .getByRole("heading", { level: 2 });

    await expect(heading).toHaveCSS("font-size", "15px");
    await expect(heading).toHaveCSS("font-weight", "700");
  });
});
