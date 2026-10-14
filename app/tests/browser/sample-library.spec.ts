import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "./fixtures.ts";

const RELEASE_BUILD = "build";
const SHIPPED_FILES = /\.(?:js|css|html)$/;
const SAMPLE_LIBRARY_MARKS = [
  "5a4d1e00-0000-4000",
  "__sample-library__",
  "Lighthouse Keeper’s Apprentice",
] as const;

test("the release build carries none of the sample library, though built with it turned on", async () => {
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
  for (const mark of SAMPLE_LIBRARY_MARKS) {
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
