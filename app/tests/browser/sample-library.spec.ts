import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import english from "../../messages/en.json" with { type: "json" };
import { expect, test } from "./fixtures.ts";

const RELEASE_BUILD = "build";
const SHIPPED_FILES = /\.(?:js|css|html)$/;
const KIT_PAGE_HEADING = "Phone kit parts";
const DEVELOPMENT_ONLY_MARKS = [
  "5a4d1e00-0000-4000",
  "__sample-library__",
  "Lighthouse Keeper’s Apprentice",
  KIT_PAGE_HEADING,
] as const;

test("the release build carries none of the sample library or the kit page, though built with both turned on", async () => {
  test.skip(
    test.info().project.name !== "chromium-desktop",
    "the build is the same for every project",
  );
  const files = (await readdir(RELEASE_BUILD, { recursive: true })).filter(
    (file) => SHIPPED_FILES.test(file),
  );

  const shipped = await Promise.all(
    files.map((file) => readFile(join(RELEASE_BUILD, file), "utf8")),
  );

  expect(files.length).toBeGreaterThan(0);
  for (const mark of DEVELOPMENT_ONLY_MARKS) {
    expect(
      files.filter((_, index) => shipped[index]?.includes(mark)),
      mark,
    ).toEqual([]);
  }
});

test("a release build answers from the core even when the address asks for samples", async ({
  page,
}) => {
  await page.goto("/?platform=ios&library=ready");

  await expect(page.locator(":root")).toHaveAttribute("data-platform", "linux");
});

test("a release build answers the kit page's address with its missing page", async ({
  page,
}) => {
  await page.goto("/kit?platform=ios");

  await expect(
    page.getByRole("heading", { name: english.problem_page_missing_title }),
  ).toBeVisible();
  await expect(page.getByText(KIT_PAGE_HEADING)).toHaveCount(0);
});
