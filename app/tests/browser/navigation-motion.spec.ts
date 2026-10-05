import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  EXPANDED_MIN_WIDTH,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  settle,
  test,
  viewportOf,
} from "./fixtures.ts";

const FADE = "0.15s ease-out";
const GROW = "0.2s cubic-bezier(0.2, 0, 0, 1)";
const SLIDE = "0.35s cubic-bezier(0.32, 0.72, 0, 1)";
const PILL_GROW = `pill-grow ${GROW}`;
const ICON_POP = "nav-pop 0.3s cubic-bezier(0.32, 0.72, 0, 1)";
const ICON_MOVE_TIMING = "0.3s ease-out";

const ICON_MOVES = [
  { label: "Library", startFrom: "/settings", move: "book-open" },
  { label: "Browse", startFrom: "/", move: "needle-swing" },
  { label: "History", startFrom: "/", move: "hands-sweep" },
  { label: "Settings", startFrom: "/", move: "gear-turn" },
] as const;

interface Motion {
  readonly transitions: readonly string[];
  readonly animations: readonly string[];
}

const STILL: Motion = { transitions: [], animations: [] };

interface StartedAnimation {
  readonly tab: string | null;
  readonly animation: string;
}

function motionIn(locator: Locator): Promise<Motion> {
  return locator.evaluate((root) => {
    const rendered = [root, ...root.querySelectorAll("*")].filter((element) =>
      element.checkVisibility(),
    );
    const transitions = new Set<string>();
    const animations = new Set<string>();
    for (const element of rendered) {
      const style = getComputedStyle(element);
      if (style.transitionDuration.split(", ").some((part) => part !== "0s")) {
        transitions.add(
          `${style.transitionDuration} ${style.transitionTimingFunction}`,
        );
      }
      if (style.animationName !== "none") {
        animations.add(
          `${style.animationName} ${style.animationDuration} ${style.animationTimingFunction}`,
        );
      }
    }
    return {
      transitions: Array.from(transitions).toSorted(),
      animations: Array.from(animations).toSorted(),
    };
  });
}

function navigation(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main" });
}

function tab(page: Page, name: string): Locator {
  return navigation(page).getByRole("link", { name });
}

function glassPill(page: Page): Locator {
  return navigation(page).locator('li[aria-hidden="true"]');
}

async function openTabAndSettle(page: Page, name: string): Promise<void> {
  await tab(page, name).click();
  await expect(tab(page, name)).toHaveAttribute("aria-current", "page");
  await settle(navigation(page));
}

async function animationsStartedWhile(
  page: Page,
  act: () => Promise<void>,
): Promise<readonly StartedAnimation[]> {
  const started = await navigation(page).evaluateHandle((root) => {
    const log: StartedAnimation[] = [];
    root.addEventListener("animationstart", (event) => {
      if (
        !(event instanceof AnimationEvent) ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const style = getComputedStyle(event.target);
      log.push({
        tab: event.target.closest("a")?.textContent.trim() ?? null,
        animation: `${event.animationName} ${style.animationDuration} ${style.animationTimingFunction}`,
      });
    });
    return log;
  });
  await act();
  return started.jsonValue();
}

async function turnTheScreen(page: Page): Promise<void> {
  const viewport = viewportOf(page);
  await page.setViewportSize({
    width: viewport.height,
    height: viewport.width,
  });
  await settle(navigation(page));
}

function testReducingMotion(): void {
  test("changes the navigation at once with reduce motion", async ({
    page,
  }) => {
    await page.goto("/history");
    const motion = await motionIn(navigation(page));

    await page.emulateMedia({ reducedMotion: "reduce" });

    expect(motion).not.toEqual(STILL);
    expect(await motionIn(navigation(page))).toEqual(STILL);
  });

  test("plays nothing on a tab change with reduce motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const started = await animationsStartedWhile(page, () =>
      openTabAndSettle(page, "History"),
    );

    expect(started).toEqual([]);
  });
}

interface IconMoveScreens {
  readonly belowWidth: number;
  readonly where: string;
}

function testMovingIcons({ belowWidth, where }: IconMoveScreens): void {
  for (const { label, startFrom, move } of ICON_MOVES) {
    test(`moves the ${label} icon as it becomes selected`, async ({ page }) => {
      await page.goto(startFrom);
      test.skip(viewportOf(page).width >= belowWidth, `${where} only`);
      await settle(navigation(page));

      const started = await animationsStartedWhile(page, () =>
        openTabAndSettle(page, label),
      );

      expect(started).toContainEqual({
        tab: label,
        animation: `${move} ${ICON_MOVE_TIMING}`,
      });
    });
  }

  test("keeps the icon still while the section stays the same", async ({
    page,
  }) => {
    await page.goto("/settings");
    test.skip(viewportOf(page).width >= belowWidth, `${where} only`);
    const icon = tab(page, "Settings").locator("svg");
    await settle(icon);

    await page.getByRole("main").getByRole("link", { name: "About" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "About" }),
    ).toBeVisible();

    expect(
      await icon.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
  });
}

function testCrossfadingTheFill(): void {
  test("crossfades the selected icon's fill", async ({ page }) => {
    await page.goto("/history");

    const icon = await motionIn(tab(page, "History").locator("svg"));

    expect(icon.transitions).toEqual([FADE]);
  });

  test("fades the icons without restarting their transitions every frame", async ({
    page,
  }) => {
    await page.goto("/");
    await settle(navigation(page));
    const cancelled = await navigation(page).evaluateHandle((root) => {
      const properties: string[] = [];
      root.addEventListener("transitioncancel", (event) => {
        if (event instanceof TransitionEvent) {
          properties.push(event.propertyName);
        }
      });
      return properties;
    });

    await openTabAndSettle(page, "History");

    expect(await cancelled.jsonValue()).toEqual([]);
  });
}

function testTurningTheScreen(): void {
  test("keeps the selected tab still when the screen turns and back", async ({
    page,
  }) => {
    await page.goto("/history");
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await settle(navigation(page));

    const started = await animationsStartedWhile(page, async () => {
      await turnTheScreen(page);
      await turnTheScreen(page);
    });

    expect(started).toEqual([]);
  });

  test("keeps a tab picked sideways still when the screen turns back", async ({
    page,
  }) => {
    await page.goto("/");
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await turnTheScreen(page);
    await openTabAndSettle(page, "History");

    const started = await animationsStartedWhile(page, () =>
      turnTheScreen(page),
    );

    expect(started).toEqual([]);
  });
}

test.describe("on Android", () => {
  test.use(onPlatform("android"));

  test("grows the new tab's pill in and fades the old one out", async ({
    page,
  }) => {
    await page.goto("/");
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "bar and rail only",
    );
    await settle(navigation(page));

    const started = await animationsStartedWhile(page, () =>
      openTabAndSettle(page, "History"),
    );

    const previous = await motionIn(tab(page, "Library"));
    expect(started).toContainEqual({ tab: "History", animation: PILL_GROW });
    expect(started.filter(({ tab }) => tab === "Library")).toEqual([]);
    expect(previous.transitions).toContain(GROW);
  });

  test("only fades the sidebar's highlight", async ({ page }) => {
    await page.goto("/history");
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "sidebar only");

    const motion = await motionIn(navigation(page));

    expect(motion).toEqual({ transitions: [FADE], animations: [] });
  });

  testMovingIcons({ belowWidth: EXPANDED_MIN_WIDTH, where: "bar and rail" });
  testCrossfadingTheFill();
  testTurningTheScreen();
  testReducingMotion();
});

test.describe("on iOS", () => {
  test.use(onPlatform("ios"));

  test("slides one glass pill under the new tab", async ({ page }) => {
    await page.goto("/");
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await expect(glassPill(page)).toHaveCount(1);

    await openTabAndSettle(page, "History");

    const pill = await boxOf(glassPill(page));
    const history = await boxOf(tab(page, "History"));
    expect(await motionIn(glassPill(page))).toEqual({
      transitions: [SLIDE],
      animations: [],
    });
    expect(pill.x).toBeCloseTo(history.x, 0);
    expect(pill.width).toBeCloseTo(history.width, 0);
  });

  test("slides the glass pill the other way in right-to-left layouts", async ({
    page,
  }) => {
    await page.goto("/");
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });
    await expect(glassPill(page)).toHaveCount(1);

    await openTabAndSettle(page, "History");

    const pill = await boxOf(glassPill(page));
    const history = await boxOf(tab(page, "History"));
    expect(pill.x).toBeCloseTo(history.x, 0);
  });

  test("bounces the new tab's icon", async ({ page }) => {
    await page.goto("/");
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await settle(navigation(page));

    const started = await animationsStartedWhile(page, () =>
      openTabAndSettle(page, "History"),
    );

    expect(started).toContainEqual({ tab: "History", animation: ICON_POP });
  });

  testTurningTheScreen();

  test("only fades the rail's and sidebar's highlight", async ({ page }) => {
    await page.goto("/history");
    test.skip(
      viewportOf(page).width < MEDIUM_MIN_WIDTH,
      "tablets and desktops only",
    );

    const motion = await motionIn(navigation(page));

    expect(motion).toEqual({ transitions: [FADE], animations: [] });
  });

  testMovingIcons({ belowWidth: MEDIUM_MIN_WIDTH, where: "phones" });
  testCrossfadingTheFill();
  testReducingMotion();
});

test.describe("on desktop", () => {
  test.use(onPlatform("linux"));

  test("only fades the highlight and keeps every icon still", async ({
    page,
  }) => {
    await page.goto("/history");

    const motion = await motionIn(navigation(page));

    expect(motion).toEqual({ transitions: [FADE], animations: [] });
  });

  testCrossfadingTheFill();
  testReducingMotion();
});
