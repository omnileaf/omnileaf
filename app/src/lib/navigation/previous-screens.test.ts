import { expect, test } from "vitest";

import { areaStyle, PreviousScreens } from "./previous-screens";

function screenSaying(text: string): HTMLElement {
  const screen = document.createElement("main");
  screen.textContent = text;
  return screen;
}

test("keeps the screens a way back can lead to", () => {
  const screens = new PreviousScreens();
  screens.keep("/", screenSaying("Library"));
  screens.keep("/history", screenSaying("History"));

  screens.forgetAllBut(new Set(["/", "/history", "/series/1"]));

  expect(screens.of("/")?.content.textContent).toBe("Library");
  expect(screens.of("/history")?.content.textContent).toBe("History");
});

test("forgets the screens no way back leads to", () => {
  const screens = new PreviousScreens();
  screens.keep("/", screenSaying("Library"));
  screens.keep("/history", screenSaying("History"));
  screens.keep(
    "/settings/privacy/screenshot-mode",
    screenSaying("Screenshot mode"),
  );

  screens.forgetAllBut(new Set(["/", "/settings", "/settings/privacy"]));

  expect(screens.of("/")?.content.textContent).toBe("Library");
  expect(screens.of("/history")).toBeUndefined();
  expect(screens.of("/settings/privacy/screenshot-mode")).toBeUndefined();
});

test("forgets every screen once it would show out of date", () => {
  const screens = new PreviousScreens();
  screens.keep("/settings", screenSaying("Settings"));

  screens.forgetAll();

  expect(screens.of("/settings")).toBeUndefined();
});

test("lands on the screen it kept once the swipe's navigation arrives there", () => {
  const screens = new PreviousScreens();
  screens.keep("/series/1", screenSaying("Series"));
  screens.landOn("/series/1");

  const landed = screens.landedOn("/series/1");

  expect(landed?.content.textContent).toBe("Series");
});

test("lands nowhere later once the swipe's navigation went nowhere", () => {
  const screens = new PreviousScreens();
  screens.keep("/series/1", screenSaying("Series"));
  screens.landOn("/series/1");
  screens.cancelLanding();

  const landed = screens.landedOn("/series/1");

  expect(landed).toBeUndefined();
});

test("places a layer over the area a screen took", () => {
  const layer = document.createElement("div");

  layer.setAttribute(
    "style",
    areaStyle({ left: 1, top: 2, width: 30, height: 40 }),
  );

  expect([
    layer.style.left,
    layer.style.top,
    layer.style.width,
    layer.style.height,
  ]).toEqual(["1px", "2px", "30px", "40px"]);
});
