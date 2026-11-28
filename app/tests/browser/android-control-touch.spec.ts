import type { CDPSession, Locator, Page } from "@playwright/test";

import {
  boxOf,
  expect,
  fakeAppInfo,
  LARGEST_TEXT_SCALE,
  onPlatform,
  setTextScale,
  settle,
  test,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

const PIXEL_9_PRO = { width: 412, height: 915 };
const LIBRARY = sampleSeries(12);
const LARGE_RESTING = "28px";
const RESTING = "20px";
const SEGMENT_END = "20px";
const PRESSED = "8px";
const LARGE_PRESSED = "12px";
const KIT_SPRING_SECONDS = "0.383s";
const SAMPLED_FRAMES = 60;
const CLOSE = 0.05;
const ACCENT_CONTAINER = "rgb(180, 240, 203)";
const STILL_EVERY_GROUP = "navigation sheets reader loading";

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

  async up(): Promise<void> {
    await this.#session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
}

async function centreOf(control: Locator): Promise<Point> {
  const box = await boxOf(control);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function keepFromActing(control: Locator): Promise<void> {
  await control.evaluate((element) => {
    element.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { capture: true },
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

function cornersOf(control: Locator): Promise<string[]> {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    return [
      style.borderStartStartRadius,
      style.borderStartEndRadius,
      style.borderEndStartRadius,
      style.borderEndEndRadius,
    ];
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
    const thumb = element.querySelector("[data-switch-thumb]");
    const halo = element.querySelector("[data-switch-halo]");
    if (thumb === null || halo === null) {
      throw new Error("the switch has no thumb or state circle");
    }
    const box = thumb.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      fill: getComputedStyle(thumb).backgroundColor,
      halo: getComputedStyle(halo).backgroundColor,
      haloWidth: getComputedStyle(halo).width,
    };
  });
}

type Corner = "borderStartStartRadius" | "borderStartEndRadius";

type Measure = Corner | "thumbSize" | "thumbOffset";

interface Frame {
  readonly value: number;
  readonly progress: number | null;
}

async function startSampling(
  control: Locator,
  measure: Measure,
): Promise<void> {
  await control.evaluate(
    (element, { measured, frames }) => {
      const TRANSITIONED = {
        borderStartStartRadius: ["border-top-left-radius"],
        borderStartEndRadius: ["border-top-right-radius"],
        thumbSize: ["width", "inline-size"],
        thumbOffset: ["width", "inline-size"],
      } as const;
      const isThumb = measured === "thumbSize" || measured === "thumbOffset";
      const target = isThumb
        ? element.querySelector("[data-switch-thumb]")
        : element;
      if (target === null) {
        throw new Error("the switch has no thumb");
      }
      const valueOf = (): number => {
        const box = target.getBoundingClientRect();
        if (measured === "thumbSize") {
          return box.width;
        }
        if (measured === "thumbOffset") {
          const track = target.parentElement?.getBoundingClientRect();
          return box.left - (track?.left ?? 0);
        }
        const drawn = Number.parseFloat(getComputedStyle(target)[measured]);
        return Math.min(drawn, box.height / 2, box.width / 2);
      };
      const progressOf = (): number | null => {
        const properties: readonly string[] = TRANSITIONED[measured];
        const running = target
          .getAnimations()
          .find(
            (animation) =>
              animation instanceof CSSTransition &&
              properties.includes(animation.transitionProperty),
          );
        return running?.effect?.getComputedTiming().progress ?? null;
      };
      const sampled: Frame[] = [];
      const sample = (): void => {
        sampled.push({ value: valueOf(), progress: progressOf() });
        element.setAttribute("data-frames", JSON.stringify(sampled));
        if (sampled.length < frames) {
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
    },
    { measured: measure, frames: SAMPLED_FRAMES },
  );
}

async function sampledFrames(control: Locator): Promise<Frame[]> {
  const read = (): Promise<Frame[]> =>
    control.evaluate(
      (element) =>
        JSON.parse(element.getAttribute("data-frames") ?? "[]") as Frame[],
    );
  await expect.poll(async () => (await read()).length).toBe(SAMPLED_FRAMES);
  return read();
}

function offTheCurve(
  frames: readonly Frame[],
  from: number,
  to: number,
): Frame[] {
  return frames.filter(({ value, progress }) =>
    progress === null
      ? Math.abs(value - from) > CLOSE && Math.abs(value - to) > CLOSE
      : Math.abs(value - (from + (to - from) * progress)) > CLOSE,
  );
}

function expectMorph(frames: readonly Frame[], from: number, to: number) {
  const values = frames.map(({ value }) => value);
  const lowest = Math.min(from, to) - CLOSE;
  const highest = Math.max(from, to) + CLOSE;
  const direction = Math.sign(to - from);
  const steps = values
    .slice(1)
    .map((value, index) => value - (values[index] ?? 0));

  expect(values[0]).toBeCloseTo(from, 1);
  expect(values.at(-1)).toBeCloseTo(to, 1);
  expect(values.filter((value) => value < lowest || value > highest)).toEqual(
    [],
  );
  expect(steps.filter((step) => step * direction < -CLOSE)).toEqual([]);
  expect(frames.some(({ progress }) => progress !== null)).toBe(true);
  expect(offTheCurve(frames, from, to)).toEqual([]);
}

async function paintedColourAt(page: Page, at: Point): Promise<string> {
  const shot = await page.screenshot({
    clip: { x: at.x, y: at.y, width: 1, height: 1 },
    scale: "css",
  });
  const probe = await page.context().newPage();
  const colour = await probe.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    context?.drawImage(image, 0, 0);
    const [red, green, blue] = context?.getImageData(0, 0, 1, 1).data ?? [];
    return `rgb(${String(red)}, ${String(green)}, ${String(blue)})`;
  }, shot.toString("base64"));
  await probe.close();
  return colour;
}

async function thumbCentreOf(control: Locator): Promise<Point> {
  return centreOf(control.locator("[data-switch-thumb]"));
}

function layerOf(colour: string): string {
  return `linear-gradient(${colour}, ${colour})`;
}

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

async function tap(page: Page, control: Locator): Promise<void> {
  const finger = await Finger.on(page);
  await finger.down(await centreOf(control));
  await finger.up();
}

async function holdPointerOn(page: Page, control: Locator): Promise<void> {
  const at = await centreOf(control);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
}

async function sampleHeldAndReleased(
  page: Page,
  control: Locator,
  measure: Measure,
): Promise<{ pressing: Frame[]; releasing: Frame[] }> {
  await startSampling(control, measure);
  await holdPointerOn(page, control);
  const pressing = await sampledFrames(control);
  await startSampling(control, measure);
  await page.mouse.up();
  const releasing = await sampledFrames(control);
  return { pressing, releasing };
}

async function expectMorphUnderHeldPointer(
  page: Page,
  control: Locator,
  { corner, resting, held }: { corner: Corner; resting: number; held: number },
): Promise<void> {
  await keepFromActing(control);

  const { pressing, releasing } = await sampleHeldAndReleased(
    page,
    control,
    corner,
  );

  expectMorph(pressing, resting, held);
  expectMorph(releasing, held, resting);
}

async function expectThumbUnderHeldPointer(
  page: Page,
  control: Locator,
  { resting, held }: { resting: number; held: number },
): Promise<void> {
  await keepFromActing(control);
  const restingOffset = await control.evaluate((element) => {
    const thumb = element.querySelector("[data-switch-thumb]");
    const track = thumb?.parentElement;
    if (thumb === null || track === null || track === undefined) {
      throw new Error("the switch has no thumb");
    }
    return (
      thumb.getBoundingClientRect().left - track.getBoundingClientRect().left
    );
  });
  const heldOffset = restingOffset - (held - resting) / 2;

  const size = await sampleHeldAndReleased(page, control, "thumbSize");
  const offset = await sampleHeldAndReleased(page, control, "thumbOffset");

  expectMorph(size.pressing, resting, held);
  expectMorph(size.releasing, held, resting);
  expectMorph(offset.pressing, restingOffset, heldOffset);
  expectMorph(offset.releasing, heldOffset, restingOffset);
}

async function disable(control: Locator): Promise<void> {
  await control.evaluate((element) => {
    element.setAttribute("disabled", "");
    element.setAttribute("data-disabled", "");
  });
}

function readStateRadios(sheet: Locator): Locator {
  return sheet
    .getByRole("radiogroup", { name: "Read state" })
    .getByRole("radio");
}

function showButton(sheet: Locator): Locator {
  return sheet.getByRole("button", { name: /^Show \d+ series$/ });
}

test.describe("Android's controls", { tag: "@native" }, () => {
  test.use({ viewport: PIXEL_9_PRO, backend: backendForLibrary() });

  test.beforeEach(({ browserName, platform }) => {
    test.skip(browserName !== "chromium", "Android's WebView is Chromium");
    test.skip(platform === "ios", "Android's controls");
    test.skip(
      !test.info().project.name.endsWith("-phone"),
      "a phone held in the hand",
    );
  });

  test.describe("under a held pointer, with reduced motion", () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
    });

    test("tightens a large filled button's corners to 12 and lays its label colour over it", async ({
      page,
    }) => {
      const show = showButton(await openLibrarySheet(page, "Sort and filter"));
      await keepFromActing(show);

      await holdPointerOn(page, show);

      await expect
        .poll(() => shapeOf(show))
        .toEqual({
          startStart: LARGE_PRESSED,
          startEnd: LARGE_PRESSED,
          layer: layerOf("rgba(230, 255, 237, 0.1)"),
        });
      await page.mouse.up();
    });

    test("keeps a busy button's corners", async ({ page }) => {
      const show = showButton(await openLibrarySheet(page, "Sort and filter"));
      await keepFromActing(show);
      await show.evaluate((element) => {
        element.setAttribute("aria-disabled", "true");
      });

      await holdPointerOn(page, show);

      expect((await shapeOf(show)).startStart).toBe(LARGE_RESTING);
      await page.mouse.up();
    });

    test("keeps a disabled button's corners and lays nothing over it", async ({
      page,
    }) => {
      const show = showButton(await openLibrarySheet(page, "Sort and filter"));
      await disable(show);

      await holdPointerOn(page, show);

      expect(await shapeOf(show)).toEqual({
        startStart: LARGE_RESTING,
        startEnd: LARGE_RESTING,
        layer: "none",
      });
      await page.mouse.up();
    });

    test("keeps a disabled segment's corners and lays nothing over it", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "Sort and filter");
      const first = readStateRadios(sheet).first();
      await disable(first);

      await holdPointerOn(page, first);

      expect(await shapeOf(first)).toEqual({
        startStart: SEGMENT_END,
        startEnd: RESTING,
        layer: "none",
      });
      await page.mouse.up();
    });

    test("keeps a disabled stepper button's corners and lays nothing over it", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "View options");
      await sheet.getByRole("radio", { name: "Choose" }).click();
      const fewer = sheet.getByRole("button", {
        name: "Fewer covers per row",
      });
      await disable(fewer);

      await holdPointerOn(page, fewer);

      expect(await shapeOf(fewer)).toEqual({
        startStart: RESTING,
        startEnd: RESTING,
        layer: "none",
      });
      await page.mouse.up();
    });

    test("keeps a disabled switch's thumb and state circle", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "View options");
      const language = sheet.getByRole("switch", { name: "Language" });
      await disable(language);
      const resting = await thumbOf(language);

      await holdPointerOn(page, language);

      expect(await thumbOf(language)).toEqual(resting);
      expect(resting.halo).toBe("rgba(0, 0, 0, 0)");
      await page.mouse.up();
    });

    test("tightens an unchosen middle segment's corners to 8 and lays the muted colour over it", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "Sort and filter");
      const middle = readStateRadios(sheet).nth(1);
      await keepFromActing(middle);

      await holdPointerOn(page, middle);

      await expect
        .poll(() => shapeOf(middle))
        .toEqual({
          startStart: PRESSED,
          startEnd: PRESSED,
          layer: layerOf("rgba(88, 97, 90, 0.1)"),
        });
      await page.mouse.up();
    });

    test("keeps the outer end of the chosen first segment round while its inner end tightens", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "Sort and filter");
      const first = readStateRadios(sheet).first();
      await expect(first).toBeChecked();
      await keepFromActing(first);

      await holdPointerOn(page, first);

      await expect
        .poll(() => shapeOf(first))
        .toEqual({
          startStart: SEGMENT_END,
          startEnd: PRESSED,
          layer: layerOf("rgba(230, 255, 237, 0.1)"),
        });
      await page.mouse.up();
    });

    test("grows a switched-on switch's thumb to 28 in the accent container over a 48 accent circle", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "View options");
      const stacks = sheet.getByRole("switch", {
        name: /^Stack series covers/,
      });
      await keepFromActing(stacks);

      await holdPointerOn(page, stacks);

      await expect
        .poll(() => thumbOf(stacks))
        .toEqual({
          width: 28,
          height: 28,
          fill: ACCENT_CONTAINER,
          halo: "rgba(50, 106, 77, 0.12)",
          haloWidth: "48px",
        });
      await page.mouse.up();
    });

    test("grows a switched-off switch's thumb to 28 in the muted colour over a 48 state circle", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "View options");
      const language = sheet.getByRole("switch", { name: "Language" });
      await expect(language).not.toBeChecked();
      await keepFromActing(language);

      await holdPointerOn(page, language);

      await expect
        .poll(() => thumbOf(language))
        .toEqual({
          width: 28,
          height: 28,
          fill: "rgb(88, 97, 90)",
          halo: "rgba(44, 53, 46, 0.1)",
          haloWidth: "48px",
        });
      await page.mouse.up();
    });

    test("paints a switched-on switch's thumb in the accent container, not tinted by its state circle", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "View options");
      const stacks = sheet.getByRole("switch", {
        name: /^Stack series covers/,
      });
      await keepFromActing(stacks);

      await holdPointerOn(page, stacks);
      await expect.poll(async () => (await thumbOf(stacks)).width).toBe(28);

      expect(await paintedColourAt(page, await thumbCentreOf(stacks))).toBe(
        ACCENT_CONTAINER,
      );
      await page.mouse.up();
    });

    test("tightens a stepper button's corners to 8 over the tonal label colour", async ({
      page,
    }) => {
      const sheet = await openLibrarySheet(page, "View options");
      await sheet.getByRole("radio", { name: "Choose" }).click();
      const fewer = sheet.getByRole("button", {
        name: "Fewer covers per row",
      });
      await keepFromActing(fewer);

      await holdPointerOn(page, fewer);

      await expect
        .poll(() => shapeOf(fewer))
        .toEqual({
          startStart: PRESSED,
          startEnd: PRESSED,
          layer: layerOf("rgba(65, 87, 73, 0.1)"),
        });
      await page.mouse.up();
    });
  });

  test.describe("on a series page", () => {
    test.use({
      backend: {
        ...new FakeShelf([{ state: "notStarted" }]).backend(),
        appInfo: () => fakeAppInfo("android"),
      },
    });

    test("keeps a disabled standard icon button's corners and lays nothing over it under a held pointer", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/series/${SERIES_ID}`);
      const find = page.getByRole("button", { name: "Find a book" });
      await expect(find).toBeVisible();
      await disable(find);

      await holdPointerOn(page, find);

      expect(await shapeOf(find)).toEqual({
        startStart: RESTING,
        startEnd: RESTING,
        layer: "none",
      });
      await page.mouse.up();
    });

    test("tightens a standard icon button to 8 over the muted colour under a held pointer", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/series/${SERIES_ID}`);
      const find = page.getByRole("button", { name: "Find a book" });
      await expect(find).toBeVisible();
      await keepFromActing(find);

      await holdPointerOn(page, find);

      await expect
        .poll(() => shapeOf(find))
        .toEqual({
          startStart: PRESSED,
          startEnd: PRESSED,
          layer: layerOf("rgba(88, 97, 90, 0.1)"),
        });
      await page.mouse.up();
    });

    test.describe("at the largest text on a narrower phone", () => {
      test.use({ viewport: { width: 390, height: 844 } });

      test("presses every wrapped Show pill to 8 on all its corners", async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await setTextScale(page, LARGEST_TEXT_SCALE);
        await page.goto(`/series/${SERIES_ID}`);
        const show = page.getByRole("radiogroup", { name: "Show" });
        const pills = ["All", "Unread", "Bookmarked"].map((name) =>
          show.getByRole("radio", { name }),
        );
        await expect
          .poll(async () => {
            const [first, last] = await Promise.all([
              boxOf(show.getByRole("radio", { name: "All" })),
              boxOf(show.getByRole("radio", { name: "Bookmarked" })),
            ]);
            return last.y > first.y;
          })
          .toBe(true);

        const pressed: string[][] = [];
        for (const pill of pills) {
          await keepFromActing(pill);
          await pill.scrollIntoViewIfNeeded();
          await holdPointerOn(page, pill);
          pressed.push(await cornersOf(pill));
          await page.mouse.up();
        }

        expect(pressed).toEqual(
          pills.map(() => [PRESSED, PRESSED, PRESSED, PRESSED]),
        );
      });
    });

    test("marks the series read with a tap on its outlined button, which then rests", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES_ID}`);
      const mark = page.getByRole("button", { name: /^Mark .+ read$/ });
      await expect(mark).toBeVisible();
      const handle = await mark.elementHandle();

      await tap(page, mark);

      await expect(
        page.getByRole("button", { name: /^Mark .+ unread$/ }),
      ).toBeVisible();
      await expect
        .poll(() =>
          handle.evaluate((element) => {
            const style = getComputedStyle(element);
            return [style.borderStartStartRadius, style.backgroundImage];
          }),
        )
        .toEqual([RESTING, "none"]);
    });

    test("morphs a held outlined button's corners smoothly from 20 to 8 and back, frame by frame", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES_ID}`);
      const mark = page.getByRole("button", { name: /^Mark .+ read$/ });
      await expect(mark).toBeVisible();

      await expectMorphUnderHeldPointer(page, mark, {
        corner: "borderStartStartRadius",
        resting: 20,
        held: 8,
      });
    });

    test("morphs a held standard icon button's corners smoothly from 20 to 8 and back, frame by frame", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES_ID}`);
      const find = page.getByRole("button", { name: "Find a book" });
      await expect(find).toBeVisible();

      await expectMorphUnderHeldPointer(page, find, {
        corner: "borderStartStartRadius",
        resting: 20,
        held: 8,
      });
    });
  });

  test("morphs a held large button's corners smoothly from 28 to 12 and back, frame by frame", async ({
    page,
  }) => {
    const show = showButton(await openLibrarySheet(page, "Sort and filter"));

    await expectMorphUnderHeldPointer(page, show, {
      corner: "borderStartStartRadius",
      resting: 28,
      held: 12,
    });
  });

  test("morphs a held stepper button's corners smoothly from 20 to 8 and back, frame by frame", async ({
    page,
  }) => {
    const sheet = await openLibrarySheet(page, "View options");
    await sheet.getByRole("radio", { name: "Choose" }).click();
    const fewer = sheet.getByRole("button", { name: "Fewer covers per row" });

    await expectMorphUnderHeldPointer(page, fewer, {
      corner: "borderStartStartRadius",
      resting: 20,
      held: 8,
    });
  });

  test("morphs a held chosen segment's inner corners smoothly from 20 to 8 and back, frame by frame", async ({
    page,
  }) => {
    const sheet = await openLibrarySheet(page, "Sort and filter");
    const first = readStateRadios(sheet).first();

    await expectMorphUnderHeldPointer(page, first, {
      corner: "borderStartEndRadius",
      resting: 20,
      held: 8,
    });
  });

  test("grows a held switched-off switch's thumb smoothly from 16 to 28 about its centre and back, frame by frame", async ({
    page,
  }) => {
    const sheet = await openLibrarySheet(page, "View options");
    const language = sheet.getByRole("switch", { name: "Language" });
    await expect(language).not.toBeChecked();

    await expectThumbUnderHeldPointer(page, language, {
      resting: 16,
      held: 28,
    });
  });

  test("grows a held switched-on switch's thumb smoothly from 24 to 28 about its centre and back, frame by frame", async ({
    page,
  }) => {
    const sheet = await openLibrarySheet(page, "View options");
    const stacks = sheet.getByRole("switch", { name: /^Stack series covers/ });
    await expect(stacks).toBeChecked();

    await expectThumbUnderHeldPointer(page, stacks, { resting: 24, held: 28 });
  });

  test("morphs a held chosen middle segment's corners smoothly from 20 to 8 and back, frame by frame", async ({
    page,
  }) => {
    const sheet = await openLibrarySheet(page, "Sort and filter");
    const middle = readStateRadios(sheet).nth(1);
    await tap(page, middle);
    await expect(middle).toBeChecked();
    await settle(middle);

    await expectMorphUnderHeldPointer(page, middle, {
      corner: "borderStartStartRadius",
      resting: 20,
      held: 8,
    });
  });

  test("tightens a held button's corners at once when every animation group is turned off", async ({
    page,
  }) => {
    await page.addInitScript((still) => {
      localStorage.setItem("omnileaf.animationsStill", still);
    }, STILL_EVERY_GROUP);
    const show = showButton(await openLibrarySheet(page, "Sort and filter"));

    const durations = await show.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    );

    expect(durations.split(", ").at(-1)).toBe("0s");
  });

  test("morphs a held button's corners in the kit's spring time, and not at all under reduced motion", async ({
    page,
  }) => {
    const show = showButton(await openLibrarySheet(page, "Sort and filter"));

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

  test("chooses a segment with a tap, which then rests", async ({ page }) => {
    const sheet = await openLibrarySheet(page, "Sort and filter");
    const middle = readStateRadios(sheet).nth(1);

    await tap(page, middle);

    await expect(middle).toBeChecked();
    await expect
      .poll(() => shapeOf(middle))
      .toEqual({ startStart: RESTING, startEnd: RESTING, layer: "none" });
  });

  test("turns a switch off with a tap, which then rests", async ({ page }) => {
    const sheet = await openLibrarySheet(page, "View options");
    const stacks = sheet.getByRole("switch", { name: /^Stack series covers/ });

    await tap(page, stacks);

    await expect(stacks).not.toBeChecked();
    await expect
      .poll(() => thumbOf(stacks))
      .toEqual({
        width: 16,
        height: 16,
        fill: "rgb(115, 125, 117)",
        halo: "rgba(0, 0, 0, 0)",
        haloWidth: "48px",
      });
  });

  test("steps the covers per row with a tap, which then rests", async ({
    page,
  }) => {
    const sheet = await openLibrarySheet(page, "View options");
    await sheet.getByRole("radio", { name: "Choose" }).click();
    const fewer = sheet.getByRole("button", { name: "Fewer covers per row" });
    const count = sheet
      .getByRole("group", { name: "Covers per row, chosen" })
      .locator("output");
    const before = await count.textContent();

    await tap(page, fewer);

    await expect(count).not.toHaveText(before ?? "");
    await expect
      .poll(() => shapeOf(fewer))
      .toEqual({ startStart: RESTING, startEnd: RESTING, layer: "none" });
  });
});
