import { expect, onPlatform, test, testOnlyInItsWebview } from "./fixtures.ts";

let historyFollowed = 0;

testOnlyInItsWebview("android");

test.use({
  backend: {
    ...onPlatform("android").backend,
    followBackHistory: () => {
      historyFollowed += 1;
      return null;
    },
  },
});

test.beforeEach(() => {
  historyFollowed = 0;
});

test("tells Android where the page's history stands after each navigation", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect.poll(() => historyFollowed).toBeGreaterThan(0);
  const onArrival = historyFollowed;

  await page.getByRole("link", { name: /^Appearance/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Appearance" }),
  ).toBeVisible();

  await expect.poll(() => historyFollowed).toBeGreaterThan(onArrival);
});
