import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

/** Counts the times the app asks for every folder to be rescanned. */
class StartRescans {
  count = 0;
}

const startRescans = new StartRescans();

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    rescanLibraryFolders: () => {
      startRescans.count += 1;
      return [];
    },
  },
});

test.beforeEach(() => {
  startRescans.count = 0;
});

test("rescans every library folder once as the app starts", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(() => startRescans.count).toBe(1);
});
