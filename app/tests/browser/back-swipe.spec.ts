import type { Page } from "@playwright/test";

import type { BackSwipe, SwipeEdge } from "../../src/lib/ipc/bindings.ts";
import type { FakeChannel } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  fakeAppInfo,
  settle,
  test,
  viewportOf,
} from "./fixtures.ts";

const NESTED_URL = "/settings/privacy/screenshot-mode";
const PARENT_URL = "/settings/privacy";
const NESTED_TITLE = "Screenshot mode";
const PARENT_TITLE = "Privacy and security";
const SHORT_VIEWPORT_HEIGHT = 200;
const LANGUAGE_KEY = "omnileaf.language";
const PSEUDO_LOCALE = "en-XA";
const PSEUDO_LOCALE_MARK = "⟦";

let swipes: FakeChannel<BackSwipe> | undefined;
const allowedEdges: (SwipeEdge | null)[] = [];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo("ios"),
    watchBackSwipes: (channel) => {
      swipes = channel;
      return null;
    },
    allowBackSwipe: (edge) => {
      allowedEdges.push(edge);
      return null;
    },
  },
});

test.beforeEach(() => {
  swipes = undefined;
  allowedEdges.length = 0;
});

function lastAllowedEdge(): SwipeEdge | null | undefined {
  return allowedEdges.at(-1);
}

async function swipe(...steps: readonly BackSwipe[]): Promise<void> {
  await expect.poll(() => swipes).toBeDefined();
  for (const step of steps) {
    await swipes?.send(step);
  }
}

/** The share of the web view's width a finger crosses to cross `share` of the screen it moves. */
async function acrossScreen(page: Page, share: number): Promise<number> {
  const screen = await boxOf(page.getByRole("main"));
  return (share * screen.width) / viewportOf(page).width;
}

function heading(page: Page, title: string) {
  return page.getByRole("heading", { level: 1, name: title });
}

function previousScreen(page: Page) {
  return page.locator("[data-previous-screen] > div").first();
}

function dimming(page: Page) {
  return page.locator("[data-previous-screen] > div").last();
}

async function openNestedScreen(
  page: Page,
  direction: "ltr" | "rtl" = "ltr",
): Promise<void> {
  await page.goto(PARENT_URL);
  await expect(heading(page, PARENT_TITLE)).toBeVisible();
  await page.evaluate((dir) => {
    document.documentElement.dir = dir;
  }, direction);
  await page
    .getByRole("main")
    .getByRole("link", { name: NESTED_TITLE })
    .click();
  await expect(heading(page, NESTED_TITLE)).toBeVisible();
}

test("lets a swipe from the left edge go back from a nested screen", async ({
  page,
}) => {
  await openNestedScreen(page);

  await expect.poll(lastAllowedEdge).toBe("left");
});

test("lets a swipe from the right edge go back in right-to-left layouts", async ({
  page,
}) => {
  await openNestedScreen(page, "rtl");

  await expect.poll(lastAllowedEdge).toBe("right");
});

test("lets no swipe go back from a top-level section", async ({ page }) => {
  await page.goto("/history");

  await expect(heading(page, "History")).toBeVisible();
  await expect.poll(lastAllowedEdge).toBeNull();
});

test("lets no swipe go back where the sections are listed beside and no back arrow shows", async ({
  page,
}) => {
  await page.goto("/settings/general");
  test.skip(
    viewportOf(page).width < EXPANDED_MIN_WIDTH,
    "the sections are listed beside only on wide screens",
  );

  await expect(heading(page, "General")).toBeVisible();
  await expect.poll(lastAllowedEdge).toBeNull();
});

test("moves the screen with the finger and brings the previous one in from behind", async ({
  page,
}) => {
  await openNestedScreen(page);
  const start = await boxOf(page.getByRole("main"));

  await swipe({ kind: "moved", progress: await acrossScreen(page, 0.5) });

  await expect
    .poll(async () => (await boxOf(page.getByRole("main"))).x - start.x)
    .toBeCloseTo(start.width * 0.5, 0);
  await expect(previousScreen(page)).toContainText(PARENT_TITLE);
  expect((await boxOf(previousScreen(page))).x - start.x).toBeCloseTo(
    -start.width * 0.15,
    0,
  );
  await expect(dimming(page)).toHaveCSS("opacity", "0.06");
});

test("moves both screens the other way in right-to-left layouts", async ({
  page,
}) => {
  await openNestedScreen(page, "rtl");
  const start = await boxOf(page.getByRole("main"));

  await swipe({ kind: "moved", progress: await acrossScreen(page, 0.5) });

  await expect
    .poll(async () => (await boxOf(page.getByRole("main"))).x - start.x)
    .toBeCloseTo(-start.width * 0.5, 0);
  expect((await boxOf(previousScreen(page))).x - start.x).toBeCloseTo(
    start.width * 0.15,
    0,
  );
});

test("keeps the screen under the finger where the navigation sits beside it", async ({
  page,
}) => {
  await openNestedScreen(page);
  const start = await boxOf(page.getByRole("main"));

  await swipe({ kind: "moved", progress: 0.25 });

  await expect
    .poll(async () => (await boxOf(page.getByRole("main"))).x - start.x)
    .toBeCloseTo(viewportOf(page).width * 0.25, 0);
});

test("goes back once the screen is past halfway, however wide the navigation beside it", async ({
  page,
}) => {
  await openNestedScreen(page);
  const pastHalfway = await acrossScreen(page, 0.55);

  await swipe(
    { kind: "moved", progress: pastHalfway },
    { kind: "released", progress: pastHalfway, velocity: 0 },
  );

  await expect(page).toHaveURL(PARENT_URL);
});

test("goes back once let go past halfway", async ({ page }) => {
  await openNestedScreen(page);

  await swipe(
    { kind: "moved", progress: 0.7 },
    { kind: "released", progress: 0.7, velocity: 0 },
  );

  await expect(page).toHaveURL(PARENT_URL);
  await expect(heading(page, PARENT_TITLE)).toBeVisible();
  await expect(previousScreen(page)).toHaveCount(0);
});

test("puts the focus on the heading of the screen it went back to", async ({
  page,
}) => {
  await openNestedScreen(page);

  await swipe(
    { kind: "moved", progress: 0.7 },
    { kind: "released", progress: 0.7, velocity: 0 },
  );

  await expect(heading(page, PARENT_TITLE)).toBeFocused();
});

test("shows the screen it went back to scrolled as it was during the swipe", async ({
  page,
}) => {
  await page.setViewportSize({
    width: viewportOf(page).width,
    height: SHORT_VIEWPORT_HEIGHT,
  });
  await page.goto(PARENT_URL);
  await expect(heading(page, PARENT_TITLE)).toBeVisible();
  await page.getByRole("main").evaluate((main) => {
    main.scrollTop = main.scrollHeight;
  });
  await page
    .getByRole("main")
    .getByRole("link", { name: NESTED_TITLE })
    .click();
  await expect(heading(page, NESTED_TITLE)).toBeVisible();
  await page.getByRole("main").evaluate((main) => {
    main.scrollTop = 0;
  });

  await swipe({ kind: "moved", progress: 0.7 });
  const shownWhileSwiping = await previousScreen(page)
    .locator(".contents > div")
    .evaluate((copy) => copy.scrollTop);
  await swipe({ kind: "released", progress: 0.7, velocity: 0 });

  await expect(heading(page, PARENT_TITLE)).toBeVisible();
  expect(shownWhileSwiping).toBeGreaterThan(0);
  await expect
    .poll(() => page.getByRole("main").evaluate((main) => main.scrollTop))
    .toBe(shownWhileSwiping);
});

test("shows no screen in a language the app has since left", async ({
  page,
}) => {
  test.skip(
    viewportOf(page).width >= EXPANDED_MIN_WIDTH,
    "General is listed beside Language on wide screens, so no back arrow shows",
  );
  await page.addInitScript(
    ({ key, locale }) => {
      if (window.sessionStorage.getItem("seeded") === null) {
        window.sessionStorage.setItem("seeded", "yes");
        window.localStorage.setItem(key, locale);
      }
    },
    { key: LANGUAGE_KEY, locale: PSEUDO_LOCALE },
  );
  await page.goto("/settings/general");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    PSEUDO_LOCALE_MARK,
  );
  await page.locator('main a[href="/settings/general/language"]').click();
  await expect(page).toHaveURL("/settings/general/language");

  await page
    .locator("label")
    .filter({ has: page.getByRole("radio", { name: "English", exact: true }) })
    .click();
  await expect(heading(page, "Language")).toBeVisible();
  await swipe({ kind: "moved", progress: 0.5 });

  await expect(page.locator("[data-previous-screen]")).toBeAttached();
  await expect(previousScreen(page)).not.toContainText(PSEUDO_LOCALE_MARK);
});

test("shows no screen with a switch turned since it was left", async ({
  page,
}) => {
  await openNestedScreen(page);

  await page.getByRole("main").getByRole("switch").first().click();
  await swipe({ kind: "moved", progress: 0.5 });

  await expect(page.locator("[data-previous-screen]")).toBeAttached();
  await expect(previousScreen(page)).not.toContainText(/Screenshot mode\s*Off/);
});

test("shows no screen with a choice made since it was left", async ({
  page,
}) => {
  test.skip(
    viewportOf(page).width >= EXPANDED_MIN_WIDTH,
    "the sections are listed beside Privacy on wide screens, so no back arrow shows",
  );
  await page.goto("/settings");
  await page
    .getByRole("main")
    .getByRole("link", { name: `${PARENT_TITLE} Ask` })
    .click();
  await expect(heading(page, PARENT_TITLE)).toBeVisible();

  await page
    .locator("label")
    .filter({ has: page.getByRole("radio", { name: "Always send" }) })
    .click();
  await swipe({ kind: "moved", progress: 0.5 });

  await expect(page.locator("[data-previous-screen]")).toBeAttached();
  await expect(previousScreen(page)).not.toContainText(
    "Ask before sending crash reports",
  );
});

test("still finishes the swipe when the screen stops moving part way", async ({
  page,
}) => {
  await openNestedScreen(page);
  await swipe({ kind: "moved", progress: 0.3 });

  await swipe({ kind: "released", progress: 0.3, velocity: 0 });
  await page.getByRole("main").evaluate(async (main) => {
    while (main.getAnimations().length === 0) {
      await new Promise(requestAnimationFrame);
    }
    for (const animation of main.getAnimations()) {
      animation.cancel();
    }
  });

  await expect(previousScreen(page)).toHaveCount(0);
});

test("goes back on a flick before halfway", async ({ page }) => {
  await openNestedScreen(page);

  await swipe(
    { kind: "moved", progress: 0.2 },
    { kind: "released", progress: 0.2, velocity: 2 },
  );

  await expect(page).toHaveURL(PARENT_URL);
});

test("springs back when let go before halfway", async ({ page }) => {
  await openNestedScreen(page);
  const start = await boxOf(page.getByRole("main"));

  await swipe(
    { kind: "moved", progress: 0.3 },
    { kind: "released", progress: 0.3, velocity: 0 },
  );

  await expect(previousScreen(page)).toHaveCount(0);
  await settle(page.getByRole("main"));
  expect((await boxOf(page.getByRole("main"))).x).toBe(start.x);
  await expect(page).toHaveURL(NESTED_URL);
});

test("finishes in 350 ms with the app's iOS easing", async ({ page }) => {
  await openNestedScreen(page);
  await swipe({ kind: "moved", progress: 0.3 });

  await swipe({ kind: "released", progress: 0.3, velocity: 0 });

  const main = page.getByRole("main");
  await expect(main).toHaveCSS("transition-duration", "0.35s");
  await expect(main).toHaveCSS(
    "transition-timing-function",
    "cubic-bezier(0.32, 0.72, 0, 1)",
  );
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("still follows the finger but leaves the previous screen in place", async ({
    page,
  }) => {
    await openNestedScreen(page);
    const start = await boxOf(page.getByRole("main"));

    await swipe({ kind: "moved", progress: await acrossScreen(page, 0.4) });

    await expect
      .poll(async () => (await boxOf(page.getByRole("main"))).x - start.x)
      .toBeCloseTo(start.width * 0.4, 0);
    expect((await boxOf(previousScreen(page))).x).toBeCloseTo(start.x, 0);
  });

  test("finishes in 200 ms without the spring", async ({ page }) => {
    await openNestedScreen(page);
    await swipe({ kind: "moved", progress: 0.3 });

    await swipe({ kind: "released", progress: 0.3, velocity: 0 });

    const main = page.getByRole("main");
    await expect(main).toHaveCSS("transition-duration", "0.2s");
    await expect(main).toHaveCSS("transition-timing-function", "ease-out");
  });
});
