import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  expect,
  LARGEST_TEXT_SCALE,
  setTextScale,
  settle,
  sidewaysOverflow,
  test,
} from "./fixtures.ts";

const EXAMPLE = [
  ["Comics", "The folder you link"],
  ["Sample Series 04 (2019)", "A series, from 2019"],
  ["Sample Series 04 v01.cbz", "Volume 1"],
  ["Sample Series 04 v02.cbz", "Volume 2"],
  ["Volume 03", "Volume 3, made of chapters"],
  ["Chapter 017.cbz", "Chapter 17, in Volume 3"],
  ["Sample Series 04 c097.cbz", "Chapter 97, after the last volume"],
  ["Specials", "Extras"],
  ["Summer Short.cbz", "A special"],
  ["Author B", "A folder for one writer"],
  ["Sample Series 02", "A series"],
  ["Sample Series 05.cbz", "A one-shot"],
] as const;

async function openGuide(page: Page): Promise<void> {
  await page.goto("/settings/library/folders");
  await expect(
    page.getByRole("heading", { name: "How folders are read" }).last(),
  ).toBeVisible();
}

function example(page: Page): Locator {
  return page.getByRole("table", { name: "An example folder" });
}

test("says files are read where they are and never changed", async ({
  page,
}) => {
  await openGuide(page);

  await expect(
    page.getByText(
      "Omnileaf reads your files where they are and never moves, renames or changes them.",
      { exact: false },
    ),
  ).toBeVisible();
});

test("shows an example folder, each line saying what it is read as", async ({
  page,
}) => {
  await openGuide(page);

  const rows = example(page).getByRole("row");
  await expect(rows.first()).toHaveText(/Name\s*Omnileaf reads it as/);
  await expect(rows).toHaveCount(EXAMPLE.length + 1);
  for (const [index, [name, reading]] of EXAMPLE.entries()) {
    await expect(rows.nth(index + 1).getByRole("cell")).toHaveText([
      name,
      reading,
    ]);
  }
});

test("indents each name by how deep it sits in the folder", async ({
  page,
}) => {
  await openGuide(page);
  const startOf = async (name: string) =>
    (await example(page).getByText(name, { exact: true }).boundingBox())?.x ??
    0;

  const linked = await startOf("Comics");
  const series = await startOf("Sample Series 04 (2019)");
  const volume = await startOf("Volume 03");
  const chapter = await startOf("Chapter 017.cbz");

  expect(series).toBeGreaterThan(linked);
  expect(volume).toBeGreaterThan(series);
  expect(chapter).toBeGreaterThan(volume);
});

test("lists the naming rules in plain words", async ({ page }) => {
  await openGuide(page);

  const rules = page
    .getByRole("list", { name: "What the names mean" })
    .getByRole("listitem");
  await expect(rules).toHaveCount(7);
  await expect(rules.last()).toHaveText(
    "Details inside a file (its ComicInfo.xml) come before any name.",
  );
});

test("keeps the example inside a narrow window at the largest text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await setTextScale(page, LARGEST_TEXT_SCALE);
  await openGuide(page);
  await settle(page.getByRole("main"));

  expect(await sidewaysOverflow(page)).toEqual([]);
});

test("has no accessibility violations", async ({ page }) => {
  await openGuide(page);

  expect(await accessibilityViolations(page)).toEqual([]);
});
