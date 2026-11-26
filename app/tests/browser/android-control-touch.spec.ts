import type { CDPSession, Locator, Page } from "@playwright/test";

import {
  boxOf,
  expect,
  fakeAppInfo,
  onPlatform,
  settle,
  test,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

const PIXEL_9_PRO = { width: 412, height: 915 };
const LIBRARY = sampleSeries(12);
const DRAG_AWAY = 240;
const CAPSULE = "999px";
const SEGMENT_END = "20px";
const PRESSED = "8px";
const LARGE_PRESSED = "12px";
const KIT_SPRING_SECONDS = "0.383s";

interface Point {
  readonly x: number;
  readonly y: number;
}

class Finger {
  readonly #session: CDPSession;

  private constructor(session: CDPSession) {
    this.#session = session;
  }

  static async on(page: Page): Promise<Finger> {
    return new Finger(await page.context().newCDPSession(page));
  }

  async down(at: Point): Promise<void> {
    await this.#session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [at],
    });
  }

  async move(to: Point): Promise<void> {
    await this.#session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [to],
    });
  }

  async up(): Promise<void> {
    await this.#session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
}

interface PressRecord {
  readonly clicks: number;
  readonly menus: number;
  readonly lifts: number;
}

async function centreOf(control: Locator): Promise<Point> {
  const box = await boxOf(control);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function recordPresses(control: Locator): Promise<void> {
  await control.evaluate((element) => {
    const count = (name: string): void => {
      element.setAttribute(
        `data-${name}`,
        String(Number(element.getAttribute(`data-${name}`) ?? "0") + 1),
      );
    };
    element.addEventListener(
      "click",
      (event) => {
        count("clicks");
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { capture: true },
    );
    element.addEventListener("contextmenu", () => {
      count("menus");
    });
    element.addEventListener("pointerup", () => {
      count("lifts");
    });
  });
}

function pressesOn(control: Locator): Promise<PressRecord> {
  return control.evaluate((element) => {
    const countOf = (name: string): number =>
      Number(element.getAttribute(`data-${name}`) ?? "0");
    return {
      clicks: countOf("clicks"),
      menus: countOf("menus"),
      lifts: countOf("lifts"),
    };
  });
}

function finishedMoving(control: Locator): Promise<void> {
  return control.evaluate(async (element) => {
    const parts = [element, ...element.querySelectorAll("*")];
    await Promise.all(
      parts.flatMap((part) =>
        part.getAnimations().map(async (animation) => animation.finished),
      ),
    );
  });
}

interface Shape {
  readonly startStart: string;
  readonly startEnd: string;
  readonly layer: string;
}

function shapeOf(control: Locator): Promise<Shape> {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      startStart: style.borderStartStartRadius,
      startEnd: style.borderStartEndRadius,
      layer: style.backgroundImage,
    };
  });
}

interface Thumb {
  readonly width: number;
  readonly height: number;
  readonly fill: string;
  readonly halo: string;
  readonly haloWidth: string;
}

function thumbOf(control: Locator): Promise<Thumb> {
  return control.evaluate((element) => {
    const thumb = element.querySelector(":scope > span > span");
    if (thumb === null) {
      throw new Error("the switch has no thumb");
    }
    const box = thumb.getBoundingClientRect();
    const halo = getComputedStyle(thumb, "::after");
    return {
      width: box.width,
      height: box.height,
      fill: getComputedStyle(thumb).backgroundColor,
      halo: halo.backgroundColor,
      haloWidth: halo.width,
    };
  });
}

function layerOf(colour: string): string {
  return `linear-gradient(${colour}, ${colour})`;
}

async function quickTap(page: Page, control: Locator): Promise<void> {
  const finger = await Finger.on(page);
  const at = await centreOf(control);
  await finger.down(at);
  await finger.up();
}

async function dragOff(page: Page, control: Locator): Promise<void> {
  const finger = await Finger.on(page);
  const at = await centreOf(control);
  await finger.down(at);
  await finger.move({ x: at.x, y: at.y - DRAG_AWAY });
  await finger.up();
}

async function longPress(page: Page, control: Locator): Promise<void> {
  const finger = await Finger.on(page);
  await finger.down(await centreOf(control));
  await expect.poll(async () => (await pressesOn(control)).menus).toBe(1);
  await finger.up();
}

const GESTURES = {
  "a quick tap": quickTap,
  "a press dragged off it": dragOff,
  "a long press": longPress,
} satisfies Record<string, (page: Page, control: Locator) => Promise<void>>;

function backendForLibrary() {
  return {
    ...onPlatform("android").backend,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
  };
}

async function openLibrarySheet(page: Page, name: string): Promise<Locator> {
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Series" })).toContainText(
    LIBRARY[0]?.title ?? "",
  );
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  const sheet = page.getByRole("dialog", { name });
  await expect(sheet).toBeVisible();
  await settle(sheet);
  return sheet;
}

test.describe("Android's controls under a finger", { tag: "@native" }, () => {
  test.use({ viewport: PIXEL_9_PRO, backend: backendForLibrary() });

  test.beforeEach(({ browserName, platform }) => {
    test.skip(browserName !== "chromium", "touches are sent through CDP");
    test.skip(platform === "ios", "Android's controls");
    test.skip(
      !test.info().project.name.endsWith("-phone"),
      "a phone held in the hand",
    );
  });

  test.describe("with reduced motion", () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
    });

    test("tightens a large filled button's corners to 12 and lays its label colour over it while held", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "Sort and filter");
      const show = sheet.getByRole("button", { name: /^Show \d+ series$/ });
      await recordPresses(show);
      const finger = await Finger.on(page);

      await finger.down(await centreOf(show));

      await expect
        .poll(() => shapeOf(show))
        .toEqual({
          startStart: LARGE_PRESSED,
          startEnd: LARGE_PRESSED,
          layer: layerOf("rgba(230, 255, 237, 0.1)"),
        });
      await finger.up();
    });

    test("tightens an unchosen middle segment's corners to 8 and lays the muted colour over it while held", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "Sort and filter");
      const group = sheet.getByRole("radiogroup", { name: "Read state" });
      const middle = group.getByRole("radio").nth(1);
      await recordPresses(middle);
      const finger = await Finger.on(page);

      await finger.down(await centreOf(middle));

      await expect
        .poll(() => shapeOf(middle))
        .toEqual({
          startStart: PRESSED,
          startEnd: PRESSED,
          layer: layerOf("rgba(88, 97, 90, 0.1)"),
        });
      await finger.up();
    });

    test("keeps the outer end of the chosen first segment round while its inner end tightens", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "Sort and filter");
      const group = sheet.getByRole("radiogroup", { name: "Read state" });
      const first = group.getByRole("radio").first();
      await expect(first).toBeChecked();
      await recordPresses(first);
      const finger = await Finger.on(page);

      await finger.down(await centreOf(first));

      await expect
        .poll(() => shapeOf(first))
        .toEqual({
          startStart: SEGMENT_END,
          startEnd: PRESSED,
          layer: layerOf("rgba(230, 255, 237, 0.1)"),
        });
      await finger.up();
    });

    test("grows a held, switched-on switch's thumb to 28 in the accent container over a 48 accent circle", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "View options");
      const stacks = sheet.getByRole("switch", {
        name: /^Stack series covers/,
      });
      await recordPresses(stacks);
      const finger = await Finger.on(page);

      await finger.down(await centreOf(stacks));

      await expect
        .poll(() => thumbOf(stacks))
        .toEqual({
          width: 28,
          height: 28,
          fill: "rgb(180, 240, 203)",
          halo: "rgba(50, 106, 77, 0.12)",
          haloWidth: "48px",
        });
      await finger.up();
    });

    test("grows a held, switched-off switch's thumb to 28 in the muted colour over a 48 state circle", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "View options");
      const language = sheet.getByRole("switch", { name: "Language" });
      await expect(language).not.toBeChecked();
      await recordPresses(language);
      const finger = await Finger.on(page);

      await finger.down(await centreOf(language));

      await expect
        .poll(() => thumbOf(language))
        .toEqual({
          width: 28,
          height: 28,
          fill: "rgb(88, 97, 90)",
          halo: "rgba(44, 53, 46, 0.1)",
          haloWidth: "48px",
        });
      await finger.up();
    });

    test("tightens a held stepper button's corners to 8 over the tonal label colour", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "View options");
      await sheet.getByRole("radio", { name: "Choose" }).click();
      const fewer = sheet.getByRole("button", {
        name: "Fewer covers per row",
      });
      await recordPresses(fewer);
      const finger = await Finger.on(page);

      await finger.down(await centreOf(fewer));

      await expect
        .poll(() => shapeOf(fewer))
        .toEqual({
          startStart: PRESSED,
          startEnd: PRESSED,
          layer: layerOf("rgba(65, 87, 73, 0.1)"),
        });
      await finger.up();
    });

    test("ends a long press with a lift and a context menu, but no click", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "Sort and filter");
      const show = sheet.getByRole("button", { name: /^Show \d+ series$/ });
      await recordPresses(show);

      await longPress(page, show);

      await expect
        .poll(() => pressesOn(show))
        .toEqual({
          clicks: 0,
          menus: 1,
          lifts: 1,
        });
    });
  });

  test.describe("on a series page", () => {
    test.use({
      backend: {
        ...new FakeShelf([{ state: "notStarted" }]).backend(),
        appInfo: () => fakeAppInfo("android"),
      },
    });

    test("tightens a held standard icon button to 8 over the muted colour", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/series/${SERIES_ID}`);
      const find = page.getByRole("button", { name: "Find a book" });
      await expect(find).toBeVisible();
      await recordPresses(find);
      const finger = await Finger.on(page);

      await finger.down(await centreOf(find));

      await expect
        .poll(() => shapeOf(find))
        .toEqual({
          startStart: PRESSED,
          startEnd: PRESSED,
          layer: layerOf("rgba(88, 97, 90, 0.1)"),
        });
      await finger.up();
    });
  });

  test("morphs a held button's corners on the kit's spring, and not at all under reduced motion", async ({
    page,
  }) => {
    const sheet = await openLibrarySheet(page, "Sort and filter");
    const show = sheet.getByRole("button", { name: /^Show \d+ series$/ });

    const moving = await show.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    const still = await show.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    );

    expect(moving.split(", ").at(-1)).toBe(KIT_SPRING_SECONDS);
    expect(still.split(", ").at(-1)).toBe("0s");
  });

  for (const [gesture, perform] of Object.entries(GESTURES)) {
    test(`returns a button to rest after ${gesture}`, async ({ page }) => {
      const sheet = await openLibrarySheet(page, "Sort and filter");
      const show = sheet.getByRole("button", { name: /^Show \d+ series$/ });
      await recordPresses(show);

      await perform(page, show);
      await finishedMoving(show);

      expect(await shapeOf(show)).toEqual({
        startStart: CAPSULE,
        startEnd: CAPSULE,
        layer: "none",
      });
    });

    test(`returns a segment to rest after ${gesture}`, async ({ page }) => {
      const sheet = await openLibrarySheet(page, "Sort and filter");
      const middle = sheet
        .getByRole("radiogroup", { name: "Read state" })
        .getByRole("radio")
        .nth(1);
      await recordPresses(middle);

      await perform(page, middle);
      await finishedMoving(middle);

      expect(await shapeOf(middle)).toEqual({
        startStart: PRESSED,
        startEnd: PRESSED,
        layer: "none",
      });
    });

    test(`returns a switch's thumb to rest after ${gesture}`, async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "View options");
      const stacks = sheet.getByRole("switch", {
        name: /^Stack series covers/,
      });
      await recordPresses(stacks);

      await perform(page, stacks);
      await finishedMoving(stacks);

      expect(await thumbOf(stacks)).toEqual({
        width: 24,
        height: 24,
        fill: "rgb(230, 255, 237)",
        halo: "rgba(0, 0, 0, 0)",
        haloWidth: "auto",
      });
    });
  }
});
