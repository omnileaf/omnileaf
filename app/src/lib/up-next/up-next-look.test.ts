import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import UpNextHarness from "./UpNextHarness.svelte";

const PHONE = { width: 390, height: 844 };
const SYSTEM_BARS_PX = 24;
const BACK_ARROW_SIZE = 24;
const BOARD = {
  back: { x: 8, y: 36, width: 40, height: 40 },
  headingTop: 174,
  seriesEndHeadingTop: 246,
  blockGap: 24,
  cardInset: 20,
  buttonIcon: 20,
  rowStart: 16,
  switchEnd: 366,
  cardTitleGap: 16,
  cardFill: [31, 40, 34],
} as const;
const CLOSE_PX = 1;
const CHANNEL_TOLERANCE = 1;
const LONG_NEXT_TITLE = "Volume 4 · A Quiet Season by the Northern Sea";
const BUTTON_HEIGHT = 40;

const NEVER_ANSWERS = new Promise<never>(() => undefined);

beforeEach(() => {
  Reflect.set(window, "__TAURI_INTERNALS__", {
    invoke: () => NEVER_ANSWERS,
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.documentElement.style.removeProperty("--system-inset-top");
  document.documentElement.style.removeProperty("--system-inset-bottom");
  document.body.replaceChildren();
});

async function onAndroidPhone(
  props: { nextTitle?: string; isSeriesEnd?: boolean } = {},
) {
  document.body.replaceChildren();
  followCorePlatform("android");
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.setProperty(
    "--system-inset-top",
    `${String(SYSTEM_BARS_PX)}px`,
  );
  document.documentElement.style.setProperty(
    "--system-inset-bottom",
    `${String(SYSTEM_BARS_PX)}px`,
  );
  await page.viewport(PHONE.width, PHONE.height);
  return render(UpNextHarness, props);
}

function boxOf(element: Element | null | undefined): DOMRect {
  if (element === null || element === undefined) {
    throw new Error("the element is not on screen");
  }
  return element.getBoundingClientRect();
}

function cardHolding(element: Element): Element {
  const card = element.closest("[data-slot=card]");
  if (card === null) {
    throw new Error("the element sits in no card");
  }
  return card;
}

function channels(colour: string): number[] {
  return [...colour.matchAll(/\d+/g)].slice(0, 3).map(Number);
}

function expectNear(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(CLOSE_PX);
}

test("draws the back arrow as Android's 24px arrow beside the top bar", async () => {
  const screen = await onAndroidPhone();

  const arrow = screen
    .getByRole("link", { name: "Back to Sample Series 04" })
    .element().firstElementChild;

  const box = arrow?.getBoundingClientRect();
  expect([box?.width, box?.height]).toEqual([BACK_ARROW_SIZE, BACK_ARROW_SIZE]);
});

test("sets the back to the series action in the muted ink", async () => {
  const screen = await onAndroidPhone();

  const back = screen.getByRole("link", { name: "Back to the series" });

  expect(getComputedStyle(back.element()).color).toBe(
    resolvedColour("--muted-foreground", "color"),
  );
});

test("puts the way back where the board's top bar does, as a 40px button", async () => {
  const screen = await onAndroidPhone();

  const back = boxOf(
    screen.getByRole("link", { name: "Back to Sample Series 04" }).element(),
  );

  expect([back.x, back.y, back.width, back.height]).toEqual([
    BOARD.back.x,
    BOARD.back.y,
    BOARD.back.width,
    BOARD.back.height,
  ]);
});

test("centres the page between the top bar and the bottom inset where the board does", async () => {
  const screen = await onAndroidPhone();

  const heading = boxOf(
    screen.getByRole("heading", { name: "Volume 3 finished" }).element(),
  );

  expectNear(heading.y, BOARD.headingTop);
});

test("leaves the board's gap between the heading, the card, Skip this screen and the hint", async () => {
  const screen = await onAndroidPhone();

  const subtitle = boxOf(
    screen.getByText("Sample Series 04 · marked as read").element(),
  );
  const card = boxOf(
    cardHolding(screen.getByRole("heading", { name: "Up next" }).element()),
  );
  const skip = boxOf(
    screen.getByRole("switch", { name: "Skip this screen" }).element(),
  );
  const hint = boxOf(
    screen.getByText("Turn the page again to start Volume 4").element(),
  );

  expect([
    card.y - subtitle.bottom,
    skip.y - card.bottom,
    hint.y - skip.bottom,
  ]).toEqual([BOARD.blockGap, BOARD.blockGap, BOARD.blockGap]);
});

test("fills the Up next card with the highest surface container, as the board does", async () => {
  const screen = await onAndroidPhone();

  const fill = getComputedStyle(
    cardHolding(screen.getByRole("heading", { name: "Up next" }).element()),
  ).backgroundColor;

  expect(fill).toBe(
    resolvedColour("--android-container-highest", "backgroundColor"),
  );
  const off = channels(fill).map((value, index) =>
    Math.abs(value - (BOARD.cardFill[index] ?? Number.NaN)),
  );
  expect(Math.max(...off)).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
});

test("insets the Up next card's words and buttons by the board's 20px", async () => {
  const screen = await onAndroidPhone();

  const label = screen.getByRole("heading", { name: "Up next" }).element();
  const card = boxOf(cardHolding(label));
  const read = boxOf(
    screen.getByRole("link", { name: "Read Volume 4" }).element(),
  );

  expect([boxOf(label).x - card.x, card.right - read.right]).toEqual([
    BOARD.cardInset,
    BOARD.cardInset,
  ]);
});

test("draws the buttons' icons at 20px", async () => {
  const screen = await onAndroidPhone();

  const icons = ["Read Volume 4", "Back to the series"].map((name) =>
    boxOf(
      screen.getByRole("link", { name }).element().querySelector("[data-icon]"),
    ),
  );

  expect(icons.map(({ width, height }) => [width, height])).toEqual([
    [BOARD.buttonIcon, BOARD.buttonIcon],
    [BOARD.buttonIcon, BOARD.buttonIcon],
  ]);
});

test("draws Skip this screen as a flush row, its switch at the end and level with its title", async () => {
  const screen = await onAndroidPhone();

  const row = screen.getByRole("switch", { name: "Skip this screen" });
  const title = boxOf(screen.getByText("Skip this screen").element());
  const track = boxOf(row.element().lastElementChild);

  expect([title.x, track.right, track.y]).toEqual([
    BOARD.rowStart,
    BOARD.switchEnd,
    title.y,
  ]);
  expect(getComputedStyle(row.element()).backgroundColor).toBe(
    "rgba(0, 0, 0, 0)",
  );
});

test("names only the volume on the buttons and the hint when the next book's name is long", async () => {
  const screen = await onAndroidPhone({ nextTitle: LONG_NEXT_TITLE });

  const read = screen.getByRole("link", { name: "Read Volume 4" });

  await expect.element(read).toBeVisible();
  expect(boxOf(read.element()).height).toBe(BUTTON_HEIGHT);
  await expect
    .element(screen.getByText("Turn the page again to start Volume 4"))
    .toBeVisible();
  await expect.element(screen.getByText(LONG_NEXT_TITLE)).toBeVisible();
});

test("centres the end of the series where the board does, its title 16px over its words", async () => {
  const screen = await onAndroidPhone({ isSeriesEnd: true });

  const heading = boxOf(
    screen.getByRole("heading", { name: "Volume 3 finished" }).element(),
  );
  const title = boxOf(
    screen
      .getByRole("heading", { name: "You've read every book in this series" })
      .element(),
  );
  const body = boxOf(
    screen
      .getByText("When a new book lands in its folder, it shows up here.")
      .element(),
  );

  expectNear(heading.y, BOARD.seriesEndHeadingTop);
  expect(body.y - title.bottom).toBe(BOARD.cardTitleGap);
});
