import type { ProjectLink } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

test.describe("with a library a newer Omnileaf wrote", () => {
  const opened: ProjectLink[] = [];
  const firstLaunchChecks = { count: 0 };

  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      libraryProblem: () => "writtenByANewerVersion",
      firstLaunchFinished: () => {
        firstLaunchChecks.count += 1;
        return false;
      },
      openProjectLink: (link) => {
        opened.push(link);
        return null;
      },
    },
  });

  test.beforeEach(() => {
    opened.length = 0;
    firstLaunchChecks.count = 0;
  });

  test("explains why instead of opening the app", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "This library is from a newer Omnileaf",
      }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    expect(firstLaunchChecks.count).toBe(0);
  });

  test("offers the latest release to open it again", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Get the latest Omnileaf" }).click();

    await expect.poll(() => opened).toEqual(["latestRelease"]);
  });
});

test.describe("with a library that couldn't be opened", () => {
  test.use({
    backend: { ...DEFAULT_BACKEND, libraryProblem: () => "couldNotOpen" },
  });

  test("says so and offers to report it", async ({ page }) => {
    await page.goto("/settings/library");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Your library couldn't be opened",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Report a problem" }),
    ).toBeVisible();
  });
});
