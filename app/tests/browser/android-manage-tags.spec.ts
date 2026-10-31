import type { LibraryTag } from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";

const TAGS: readonly LibraryTag[] = [
  { name: "Slice of life", seriesCount: 12 },
  { name: "Seinen", seriesCount: 1 },
  { name: "Sea", seriesCount: 3 },
];

test.use({
  backend: { ...DEFAULT_BACKEND, libraryTags: () => [...TAGS] },
});

test.describe("Manage tags on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's list rows");
  });

  test("draws the search field as a 56px pill with no outline, 16px in", async ({
    page,
  }) => {
    await page.goto("/settings/library/tags");
    const field = page.getByRole("searchbox", { name: "Find a tag" });
    const pill = field.locator("xpath=..");
    const box = await boxOf(pill);

    expect(box.height).toBeCloseTo(56, 0);
    await expect(pill).toHaveCSS("border-top-width", "0px");
    await expect(pill).toHaveCSS(
      "background-color",
      await tokenColour(page, "--color-android-container-high"),
    );
    expect(box.x).toBeCloseTo(16, 0);
  });

  test("sets the count line in 14px muted type", async ({ page }) => {
    await page.goto("/settings/library/tags");
    const note = page.getByText("3 tags.");

    await expect(note).toHaveCSS("font-size", "14px");
    await expect(note).toHaveCSS("line-height", "20px");
    await expect(note).toHaveCSS(
      "color",
      await tokenColour(page, "--color-muted"),
    );
  });

  test("lists the tags flat, each a 16px name over a 14px count with Rename and Delete 48px buttons at the end", async ({
    page,
  }) => {
    await page.goto("/settings/library/tags");
    const list = page.getByRole("list", { name: "Tags" });
    const row = list.getByRole("listitem").filter({ hasText: "Seinen" });
    const name = row.getByText("Seinen", { exact: true });
    const count = row.getByText("1 series");
    const rename = row.getByRole("button", { name: "Rename Seinen" });
    const remove = row.getByRole("button", { name: "Delete Seinen" });

    await expect(list).toHaveCSS("border-top-width", "0px");
    await expect(name).toHaveCSS("font-size", "16px");
    await expect(name).toHaveCSS("line-height", "24px");
    await expect(name).toHaveCSS("font-weight", "400");
    await expect(count).toHaveCSS("font-size", "14px");
    await expect(count).toHaveCSS("line-height", "20px");
    expect((await boxOf(row)).height).toBeGreaterThanOrEqual(72);
    expect(await boxOf(rename)).toMatchObject({ width: 48, height: 48 });
    expect(await boxOf(remove)).toMatchObject({ width: 48, height: 48 });
    expect((await boxOf(name)).x - (await boxOf(row)).x).toBeCloseTo(16, 0);
  });
});
