import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const told: boolean[] = [];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    setLearnsReadingSpeed: (isOn) => {
      told.push(isOn);
    },
  },
});

test.beforeEach(() => {
  told.length = 0;
});

test("tells the library whether to learn the reading speed, and keeps telling it after a restart", async ({
  page,
}) => {
  await page.goto("/settings/reading");
  await expect.poll(() => told.at(-1)).toBe(true);

  await page
    .getByRole("region", { name: "Smart features" })
    .getByRole("switch", { name: "Learn my reading speed" })
    .click();

  await expect.poll(() => told.at(-1)).toBe(false);
  told.length = 0;
  await page.reload();
  await expect.poll(() => told.at(-1)).toBe(false);
});
