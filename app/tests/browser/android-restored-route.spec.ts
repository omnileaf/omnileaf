import type { FakeBackend } from "./fake-backend.ts";
import { expect, onPlatform, test, testOnlyInItsWebview } from "./fixtures.ts";

const SAVED_PAGE = "/settings/appearance";

const taken = { count: 0 };
const canGoBack: boolean[] = [];

testOnlyInItsWebview("android");

function rebuiltScreen(changes: Partial<FakeBackend> = {}): FakeBackend {
  return {
    ...onPlatform("android").backend,
    takeRestoredRoute: () => {
      taken.count += 1;
      return taken.count === 1 ? SAVED_PAGE : null;
    },
    followBackHistory: (canGo) => {
      canGoBack.push(canGo);
      return null;
    },
    ...changes,
  };
}

test.beforeEach(() => {
  taken.count = 0;
  canGoBack.length = 0;
});

test.describe("when Android rebuilt the screen on a page", () => {
  test.use({ backend: rebuiltScreen() });

  test("opens the page it was on", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Appearance" }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(SAVED_PAGE);
  });

  test("lets Back go to the library instead of leaving the app", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Appearance" }),
    ).toBeVisible();

    await page.goBack();

    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();
  });

  test("tells Android there is a page to go back to", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Appearance" }),
    ).toBeVisible();

    await expect.poll(() => canGoBack.at(-1)).toBe(true);
  });
});

test.describe("when Android rebuilt the screen while the library has a problem", () => {
  test.use({
    backend: rebuiltScreen({ libraryProblem: () => "couldNotOpen" }),
  });

  test("takes the saved page and drops it", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Your library couldn't be opened",
      }),
    ).toBeVisible();
    expect([taken.count, new URL(page.url()).pathname]).toEqual([1, "/"]);
  });
});

test.describe("when Android rebuilt the screen during first launch", () => {
  test.use({
    backend: rebuiltScreen({ firstLaunchFinished: () => false }),
  });

  test("takes the saved page and drops it", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("button", { name: "Get started" }),
    ).toBeVisible();
    expect([taken.count, new URL(page.url()).pathname]).toEqual([
      1,
      "/first-launch",
    ]);
  });
});
