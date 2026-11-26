import type { JSHandle, Locator, Page } from "@playwright/test";

import {
  boxOf,
  EXPANDED_MIN_WIDTH,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  settle,
  test,
  testOnlyInItsWebview,
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

interface AnimationWatch {
  readonly started: string[];
  readonly ended: string[];
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

function watchAnimationsIn(link: Locator): Promise<JSHandle<AnimationWatch>> {
  return link.evaluateHandle((root) => {
    const watch: AnimationWatch = { started: [], ended: [] };
    root.addEventListener("animationstart", (event) => {
      if (event instanceof AnimationEvent) {
        watch.started.push(event.animationName);
      }
    });
    root.addEventListener("animationend", (event) => {
      if (event instanceof AnimationEvent) {
        watch.ended.push(`${event.animationName} finished`);
      }
    });
    root.addEventListener("animationcancel", (event) => {
      if (event instanceof AnimationEvent) {
        watch.ended.push(`${event.animationName} cancelled`);
      }
    });
    return watch;
  });
}

async function expectToRunToItsEnd(
  watch: JSHandle<AnimationWatch>,
  animation: string,
): Promise<void> {
  await expect
    .poll(() => watch.evaluate(({ started }) => started))
    .toContain(animation);
  await expect
    .poll(() => watch.evaluate(({ ended }) => ended))
    .toContain(`${animation} finished`);
  expect(await watch.evaluate(({ ended }) => ended)).not.toContain(
    `${animation} cancelled`,
  );
}

interface IconLayers {
  readonly outlined: string;
  readonly filled: string;
}

function iconLayersOf(link: Locator): Promise<IconLayers> {
  return link.evaluate((root) => {
    const opacityOf = (selector: string) => {
      const layer = root.querySelector(selector);
      if (layer === null) {
        throw new Error(`the tab draws no ${selector}`);
      }
      return getComputedStyle(layer).opacity;
    };
    return {
      outlined: opacityOf("[data-icon]:not([data-filled])"),
      filled: opacityOf("[data-icon][data-filled]"),
    };
  });
}

async function iconFadesWhile(
  page: Page,
  act: () => Promise<void>,
): Promise<readonly string[]> {
  const faded = await navigation(page).evaluateHandle((root) => {
    const log: string[] = [];
    root.addEventListener("transitionrun", (event) => {
      if (
        !(event instanceof TransitionEvent) ||
        !(event.target instanceof Element) ||
        !event.target.hasAttribute("data-icon") ||
        event.propertyName !== "opacity"
      ) {
        return;
      }
      const style = getComputedStyle(event.target);
      const layer = event.target.hasAttribute("data-filled")
        ? "filled"
        : "outlined";
      log.push(
        `${event.target.closest("a")?.textContent.trim() ?? ""} ${layer} ${style.transitionDuration} ${style.transitionTimingFunction}`,
      );
    });
    return log;
  });
  await act();
  return (await faded.jsonValue()).toSorted();
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

function testHoldingStillWithNavigationOff(): void {
  test("plays nothing on a tab change with Navigation animations off", async ({
    page,
  }) => {
    await page.goto("/settings/advanced");
    await page.getByRole("link", { name: "Animations" }).click();
    await page.getByRole("switch", { name: "Navigation" }).click();
    await expect(
      page.getByRole("switch", { name: "Navigation" }),
    ).not.toBeChecked();
    await settle(navigation(page));
    const faded = await navigation(page).evaluateHandle((root) => {
      const log: string[] = [];
      root.addEventListener("transitionrun", (event) => {
        if (
          event instanceof TransitionEvent &&
          event.target instanceof Element &&
          event.target.closest("svg, [data-slot^='navigation-']") !== null
        ) {
          log.push(event.propertyName);
        }
      });
      return log;
    });

    const started = await animationsStartedWhile(page, () =>
      openTabAndSettle(page, "History"),
    );

    expect(started).toEqual([]);
    expect(await faded.jsonValue()).toEqual([]);
  });
}

interface IconMoveScreens {
  readonly belowWidth: number;
  readonly where: string;
  readonly icon: string;
}

function testMovingIcons({ belowWidth, where, icon }: IconMoveScreens): void {
  for (const { label, startFrom, move } of ICON_MOVES) {
    test(`moves the ${label} icon as it becomes selected`, async ({ page }) => {
      test.skip(viewportOf(page).width >= belowWidth, `${where} only`);
      await page.goto(startFrom);
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

  testKeepingTheIconStill({ belowWidth, where, icon });
}

function testRunningIconMovesToTheirEnd({
  belowWidth,
  where,
}: Omit<IconMoveScreens, "icon">): void {
  for (const { label, startFrom, move } of ICON_MOVES) {
    test(`runs the ${label} icon's move to its end when the tab is tapped`, async ({
      page,
    }) => {
      test.skip(viewportOf(page).width >= belowWidth, `${where} only`);
      await page.goto(startFrom);
      await settle(navigation(page));
      const watch = await watchAnimationsIn(tab(page, label));

      await tab(page, label).tap();

      await expectToRunToItsEnd(watch, move);
    });
  }
}

function testKeepingTheIconStill({
  belowWidth,
  where,
  icon,
}: IconMoveScreens): void {
  test("keeps the icon still while the section stays the same", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width >= belowWidth, `${where} only`);
    await page.goto("/settings");
    const settingsIcon = tab(page, "Settings").locator(icon);
    await settle(settingsIcon);

    await page.getByRole("main").getByRole("link", { name: "About" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "About" }),
    ).toBeVisible();

    expect(
      await settingsIcon.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
  });
}

function testCrossfadingTheFill(iconsBelowWidth = Infinity): void {
  test("crossfades the selected icon's fill", async ({ page }) => {
    test.skip(
      viewportOf(page).width >= iconsBelowWidth,
      "the top tab bar has no icons",
    );
    await page.goto("/history");

    const icon = await motionIn(tab(page, "History").locator("svg"));

    expect(icon.transitions).toEqual([FADE]);
  });

  testFadingWithoutRestarting();
}

function testFadingWithoutRestarting(): void {
  test("fades the tabs without restarting their transitions every frame", async ({
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
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await page.goto("/history");
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
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await page.goto("/");
    await turnTheScreen(page);
    await openTabAndSettle(page, "History");

    const started = await animationsStartedWhile(page, () =>
      turnTheScreen(page),
    );

    expect(started).toEqual([]);
  });
}

test.describe("on Android", () => {
  testOnlyInItsWebview("android");
  test.use(onPlatform("android"));

  test("grows the new tab's pill in and fades the old one out", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "bar and rail only",
    );
    await page.goto("/");
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
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "sidebar only");
    await page.goto("/history");

    const motion = await motionIn(navigation(page));

    expect(motion).toEqual({ transitions: [FADE], animations: [] });
  });

  testKeepingTheIconStill({
    belowWidth: EXPANDED_MIN_WIDTH,
    where: "bar and rail",
    icon: '[data-slot="navigation-icon"]',
  });

  testRunningIconMovesToTheirEnd({
    belowWidth: EXPANDED_MIN_WIDTH,
    where: "bar and rail",
  });

  test("shows only the selected tab's icon filled", async ({ page }) => {
    await page.goto("/history");
    await settle(navigation(page));

    const history = await iconLayersOf(tab(page, "History"));
    const library = await iconLayersOf(tab(page, "Library"));

    expect(history).toEqual({ outlined: "0", filled: "1" });
    expect(library).toEqual({ outlined: "1", filled: "0" });
  });

  test("crossfades both tabs' icons over the pill's growth", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "bar and rail only",
    );
    await page.goto("/");
    await settle(navigation(page));

    const faded = await iconFadesWhile(page, () =>
      openTabAndSettle(page, "History"),
    );

    expect(faded).toEqual(
      [
        `History filled ${GROW}`,
        `History outlined ${GROW}`,
        `Library filled ${GROW}`,
        `Library outlined ${GROW}`,
      ].toSorted(),
    );
  });

  testFadingWithoutRestarting();
  testTurningTheScreen();
  testReducingMotion();
  testHoldingStillWithNavigationOff();
});

test.describe("on iOS", () => {
  testOnlyInItsWebview("ios");
  test.use(onPlatform("ios"));

  test("slides one glass pill under the new tab", async ({ page }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await page.goto("/");
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
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await page.goto("/");
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
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await page.goto("/");
    await settle(navigation(page));

    const started = await animationsStartedWhile(page, () =>
      openTabAndSettle(page, "History"),
    );

    expect(started).toContainEqual({ tab: "History", animation: ICON_POP });
  });

  test("runs the new tab's bounce to its end when the tab is tapped", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await page.goto("/");
    await settle(navigation(page));
    const watch = await watchAnimationsIn(tab(page, "History"));

    await tab(page, "History").tap();

    await expectToRunToItsEnd(watch, "nav-pop");
  });

  testRunningIconMovesToTheirEnd({
    belowWidth: MEDIUM_MIN_WIDTH,
    where: "phones",
  });

  testTurningTheScreen();

  test("only fades the highlight of the rail, sidebar and top tab bar", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width < MEDIUM_MIN_WIDTH,
      "tablets and desktops only",
    );
    await page.goto("/history");

    const motion = await motionIn(navigation(page));

    expect(motion).toEqual({ transitions: [FADE], animations: [] });
  });

  test("dims a pressed top tab at once instead of fading it", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width < MEDIUM_MIN_WIDTH,
      "tablets and desktops only",
    );
    await page.goto("/");
    const link = tab(page, "History");
    const { x, y, width, height } = await boxOf(link);

    await page.mouse.move(x + width / 2, y + height / 2);
    await page.mouse.down();
    const fadingProperties = await link.evaluate((element) =>
      element
        .getAnimations()
        .flatMap((animation) =>
          animation instanceof CSSTransition
            ? [animation.transitionProperty]
            : [],
        ),
    );
    await page.mouse.up();

    expect(fadingProperties).not.toContain("opacity");
  });

  testMovingIcons({
    belowWidth: MEDIUM_MIN_WIDTH,
    where: "phones",
    icon: "svg",
  });
  testCrossfadingTheFill(MEDIUM_MIN_WIDTH);
  testReducingMotion();
  testHoldingStillWithNavigationOff();
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
