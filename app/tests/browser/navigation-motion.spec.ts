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
import { slowMoves } from "./held-animations.ts";

const FADE = "0.15s ease-out";
const GROW = "0.2s cubic-bezier(0.2, 0, 0, 1)";
const SLIDE = "0.35s cubic-bezier(0.32, 0.72, 0, 1)";
const PILL_GROW = `pill-grow ${GROW}`;
const ICON_POP = "nav-pop 0.3s cubic-bezier(0.32, 0.72, 0, 1)";
const ICON_MOVE_TIMING = "0.3s ease-out";

interface IconMove {
  readonly label: string;
  readonly startFrom: string;
  readonly move: string;
}

const ICON_MOVES: readonly IconMove[] = [
  { label: "Library", startFrom: "/settings", move: "book-open" },
  { label: "Browse", startFrom: "/", move: "needle-swing" },
  { label: "History", startFrom: "/", move: "hands-sweep" },
  { label: "Settings", startFrom: "/", move: "gear-turn" },
];

const ANDROID_ICON_MOVES: readonly IconMove[] = [
  { label: "Library", startFrom: "/settings", move: "book-pop" },
  { label: "Browse", startFrom: "/", move: "needle-sway" },
  { label: "History", startFrom: "/", move: "clock-rewind" },
  { label: "Settings", startFrom: "/", move: "gear-turn" },
];

const MOVE_SAMPLES = [0, 0.25, 0.5, 0.75, 0.999] as const;
const ONE_TOOTH_DEG = 60;
const REST_TOLERANCE = 0.01;
const VISIBLY_MOVED = 0.05;
const PRESS_FRAMES = 4;
const LONG_PRESS_MS = 800;
const TAP_MS = 50;
const FINGER = { pointerType: "touch", isPrimary: true } as const;
const HAND_OVER_FRAMES = 40;

const HALFWAY = "0.5";
const DOUBLED_ROOT_FONT = ":root { font-size: 200% !important; }";
const SAME_PIXEL_TOLERANCE = 2;

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

interface MoveSample {
  readonly rotate: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly matrix: { a: number; b: number; c: number; d: number };
}

async function sampleMove(
  page: Page,
  label: string,
  move: string,
): Promise<MoveSample[]> {
  const icon = tab(page, label).locator('[data-slot="navigation-icon"]');
  await tab(page, label).tap();
  await expect
    .poll(() =>
      icon.evaluate(
        (element, name) =>
          element
            .getAnimations()
            .some(
              (animation) =>
                animation instanceof CSSAnimation &&
                animation.animationName === name,
            ),
        move,
      ),
    )
    .toBe(true);
  return icon.evaluate(
    (element, { name, fractions }) => {
      const motion = element
        .getAnimations()
        .find(
          (animation) =>
            animation instanceof CSSAnimation &&
            animation.animationName === name,
        );
      const duration = Number(motion?.effect?.getComputedTiming().duration);
      if (motion === undefined || !Number.isFinite(duration)) {
        throw new Error(`no ${name} move on the icon`);
      }
      motion.pause();
      return fractions.map((fraction) => {
        motion.currentTime = duration * fraction;
        const style = getComputedStyle(element);
        const rotate = style.rotate === "none" ? 0 : parseFloat(style.rotate);
        const [scaleX = 1, scaleY = scaleX] =
          style.scale === "none" ? [] : style.scale.split(" ").map(Number);
        const { a, b, c, d } = new DOMMatrix()
          .rotate(rotate)
          .scale(scaleX, scaleY);
        return { rotate, scaleX, scaleY, matrix: { a, b, c, d } };
      });
    },
    { name: move, fractions: [...MOVE_SAMPLES] },
  );
}

function distanceFromRest(sample: MoveSample | undefined): number {
  if (sample === undefined) {
    return Infinity;
  }
  const { a, b, c, d } = sample.matrix;
  return Math.max(Math.abs(a - 1), Math.abs(b), Math.abs(c), Math.abs(d - 1));
}

interface PillFrame {
  readonly isPressed: boolean;
  readonly isHeld: boolean;
  readonly isTinted: boolean;
  readonly pill: number;
}

async function pressWithTheMouse(page: Page, link: Locator): Promise<void> {
  const { x, y, width, height } = await boxOf(link);
  await page.mouse.move(x + width / 2, y + height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

async function tapWithAFinger(page: Page, link: Locator): Promise<void> {
  const { x, y, width, height } = await boxOf(link);
  const browser = await page.context().newCDPSession(page);
  await browser.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: x + width / 2, y: y + height / 2 }],
  });
  await page.waitForTimeout(TAP_MS);
  await browser.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

async function pillFramesWhilePressing(
  page: Page,
  label: string,
  press: (page: Page, link: Locator) => Promise<void> = pressWithTheMouse,
): Promise<PillFrame[]> {
  const link = tab(page, label);
  const recording = await link.evaluateHandle((root) => {
    const pill = root.querySelector('[data-slot="navigation-pill"]');
    const holder = pill?.parentElement;
    if (pill === null || holder === null || holder === undefined) {
      throw new Error("the tab has no pill");
    }
    const frames: PillFrame[] = [];
    const record = () => {
      frames.push({
        isPressed: root.matches(":active"),
        isHeld: holder.hasAttribute("data-held-press"),
        isTinted: getComputedStyle(holder).backgroundImage !== "none",
        pill: Number(getComputedStyle(pill).opacity),
      });
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
    return frames;
  });
  await expect
    .poll(() => recording.evaluate((frames) => frames.length))
    .toBeGreaterThan(PRESS_FRAMES);
  await press(page, link);
  await expect(link).toHaveAttribute("aria-current", "page");
  const pressedAt = await recording.evaluate((frames) => frames.length);
  await expect
    .poll(() => recording.evaluate((frames) => frames.length))
    .toBeGreaterThan(pressedAt + HAND_OVER_FRAMES);
  const frames = await recording.jsonValue();
  return frames.slice(
    frames.findIndex(({ isPressed, isHeld }) => isPressed || isHeld),
  );
}

function showsAPill({ isPressed, isHeld, isTinted, pill }: PillFrame): boolean {
  return ((isPressed || isHeld) && isTinted) || pill >= 1;
}

function heldPresses(page: Page): Locator {
  return navigation(page).locator("[data-held-press]");
}

async function longPress(page: Page, target: Locator): Promise<void> {
  await target.dispatchEvent("pointerdown", FINGER);
  await page.clock.runFor(LONG_PRESS_MS);
  await target.dispatchEvent("pointerup", FINGER);
  await target.dispatchEvent("click");
}

async function turnNavigationMotionOff(page: Page): Promise<void> {
  await page.goto("/settings/advanced");
  await page.getByRole("link", { name: "Animations" }).click();
  await page.getByRole("switch", { name: "Navigation" }).click();
  await expect(
    page.getByRole("switch", { name: "Navigation" }),
  ).not.toBeChecked();
}

async function iconPixels(page: Page, icon: Locator): Promise<number[]> {
  const png = await page.screenshot({ clip: await boxOf(icon) });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) {
      throw new Error("no 2d canvas");
    }
    context.drawImage(image, 0, 0);
    return [...context.getImageData(0, 0, image.width, image.height).data];
  }, png.toString("base64"));
}

function centreOffset(icon: Locator): Promise<number[]> {
  return icon.evaluate((wrapper) => {
    const middle = (box: DOMRect) => [
      box.x + box.width / 2,
      box.y + box.height / 2,
    ];
    const [wrapperX = 0, wrapperY = 0] = middle(
      wrapper.getBoundingClientRect(),
    );
    return Array.from(wrapper.querySelectorAll("[data-icon]")).flatMap(
      (glyph) => {
        const [glyphX = 0, glyphY = 0] = middle(glyph.getBoundingClientRect());
        return [glyphX - wrapperX, glyphY - wrapperY];
      },
    );
  });
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
  readonly moves: readonly IconMove[];
}

function testMovingIcons({
  belowWidth,
  where,
  icon,
  moves,
}: IconMoveScreens): void {
  for (const { label, startFrom, move } of moves) {
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
  moves,
}: Omit<IconMoveScreens, "icon">): void {
  for (const { label, startFrom, move } of moves) {
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
}: Omit<IconMoveScreens, "moves">): void {
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

  testMovingIcons({
    belowWidth: EXPANDED_MIN_WIDTH,
    where: "bar and rail",
    icon: '[data-slot="navigation-icon"]',
    moves: ANDROID_ICON_MOVES,
  });

  testRunningIconMovesToTheirEnd({
    belowWidth: EXPANDED_MIN_WIDTH,
    where: "bar and rail",
    moves: ANDROID_ICON_MOVES,
  });

  for (const { label, startFrom, move } of ANDROID_ICON_MOVES) {
    test(`starts and ends the ${label} icon's move at rest`, async ({
      page,
    }) => {
      test.skip(
        viewportOf(page).width >= EXPANDED_MIN_WIDTH,
        "bar and rail only",
      );
      await page.goto(startFrom);
      await settle(navigation(page));
      await slowMoves(page);

      const samples = await sampleMove(page, label, move);

      const [start, , middle] = samples;
      expect(distanceFromRest(start)).toBeLessThan(REST_TOLERANCE);
      expect(distanceFromRest(middle)).toBeGreaterThan(VISIBLY_MOVED);
      if (move === "gear-turn") {
        expect(samples.at(-1)?.rotate).toBeCloseTo(ONE_TOOTH_DEG, 0);
      } else {
        expect(distanceFromRest(samples.at(-1))).toBeLessThan(REST_TOLERANCE);
      }
    });
  }

  test("turns the History icon back, the way its arrow points", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "bar and rail only",
    );
    await page.goto("/");
    await settle(navigation(page));
    await slowMoves(page);

    const [, quarter, middle] = await sampleMove(
      page,
      "History",
      "clock-rewind",
    );

    expect(quarter?.rotate).toBeLessThan(0);
    expect(middle?.rotate).toBeLessThan(0);
  });

  test("pops the Library icon on both axes together", async ({ page }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "bar and rail only",
    );
    await page.goto("/settings");
    await settle(navigation(page));
    await slowMoves(page);

    const samples = await sampleMove(page, "Library", "book-pop");

    for (const { scaleX, scaleY } of samples) {
      expect(scaleX).toBeCloseTo(scaleY, 5);
    }
    expect(samples[2]?.scaleX).toBeGreaterThan(1);
  });

  for (const { from, label } of [
    { from: "/", label: "History" },
    { from: "/browse", label: "History" },
    { from: "/history", label: "Settings" },
    { from: "/settings", label: "Library" },
  ]) {
    test(`keeps a pill on ${label} from a finger's tap on ${from} until it is chosen`, async ({
      page,
    }) => {
      test.skip(
        viewportOf(page).width >= EXPANDED_MIN_WIDTH,
        "bar and rail only",
      );
      await page.goto(from);
      await settle(navigation(page));

      const frames = await pillFramesWhilePressing(page, label, tapWithAFinger);

      expect(frames.length).toBeGreaterThan(HAND_OVER_FRAMES);
      expect(frames.filter((frame) => !showsAPill(frame))).toEqual([]);
      expect(frames.some(({ isHeld }) => isHeld)).toBe(true);
    });
  }

  test("leaves no grey on the open tab when it is tapped", async ({ page }) => {
    await page.goto("/history");
    await settle(navigation(page));

    await tab(page, "History").tap();
    await settle(navigation(page));

    await expect(heldPresses(page)).toHaveCount(0);
  });

  test("leaves no grey after a long press that shows the tab's name", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "bar and rail only",
    );
    await page.addInitScript(() => {
      localStorage.setItem("omnileaf.sidebar", "hidden");
    });
    await page.goto("/");
    await settle(navigation(page));
    await page.clock.install();

    await longPress(page, tab(page, "History"));

    await expect(
      page.getByText("History", { exact: true }).last(),
    ).toBeVisible();
    await expect(heldPresses(page)).toHaveCount(0);
    await expect(tab(page, "Library")).toHaveAttribute("aria-current", "page");
  });

  test("leaves no grey on a tab overtaken by a second tap", async ({
    page,
  }) => {
    await page.goto("/");
    await settle(navigation(page));

    await tab(page, "History").click();
    await tab(page, "Browse").click();
    await expect(tab(page, "Browse")).toHaveAttribute("aria-current", "page");
    await settle(navigation(page));

    await expect(heldPresses(page)).toHaveCount(0);
  });

  test("lets go of a press lifted without a tap at the next touch", async ({
    page,
  }) => {
    await page.goto("/");
    await settle(navigation(page));
    await tab(page, "History").dispatchEvent("pointerup", FINGER);

    await page.getByRole("main").dispatchEvent("pointerdown", FINGER);

    await expect(heldPresses(page)).toHaveCount(0);
    await expect(tab(page, "Library")).toHaveAttribute("aria-current", "page");
  });

  for (const { motionOff, turnOff } of [
    {
      motionOff: "with reduce motion",
      turnOff: (page: Page) => page.emulateMedia({ reducedMotion: "reduce" }),
    },
    {
      motionOff: "with Navigation animations off",
      turnOff: turnNavigationMotionOff,
    },
  ]) {
    test(`holds no grey after a press ${motionOff}`, async ({ page }) => {
      test.skip(
        viewportOf(page).width >= EXPANDED_MIN_WIDTH,
        "bar and rail only",
      );
      await turnOff(page);
      await page.goto("/");
      await settle(navigation(page));

      const frames = await pillFramesWhilePressing(page, "History");

      expect(
        frames.filter(
          ({ isPressed, isHeld, isTinted }) => isHeld && !isPressed && isTinted,
        ),
      ).toEqual([]);
    });
  }

  test("keeps the History icon at full strength halfway through its crossfade", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "bar and rail only",
    );
    await page.goto("/history");
    const icon = tab(page, "History").locator('[data-slot="navigation-icon"]');
    await settle(navigation(page));
    const atRest = await iconPixels(page, icon);

    await icon.evaluate((wrapper, halfway) => {
      for (const glyph of wrapper.querySelectorAll<HTMLElement>(
        "[data-icon]",
      )) {
        glyph.style.transition = "none";
        glyph.style.opacity = halfway;
      }
    }, HALFWAY);
    const halfwayThrough = await iconPixels(page, icon);

    const furthest = Math.max(
      ...halfwayThrough.map((channel, index) =>
        Math.abs(channel - (atRest[index] ?? 0)),
      ),
    );
    expect(furthest).toBeLessThanOrEqual(SAME_PIXEL_TOLERANCE);
  });

  test("centres the icon's glyphs in their box when the root font grows", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "bar and rail only",
    );
    await page.goto("/");
    await page.addStyleTag({ content: DOUBLED_ROOT_FONT });
    const icon = tab(page, "Browse").locator('[data-slot="navigation-icon"]');

    const offsets = await centreOffset(icon);

    expect(offsets).toHaveLength(4);
    for (const offset of offsets) {
      expect(offset).toBeCloseTo(0, 0);
    }
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
    moves: ICON_MOVES,
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
    moves: ICON_MOVES,
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
