import { expect, test } from "vitest";

import { PreviousScreens } from "./previous-screens";

function screenSaying(text: string): HTMLElement {
  const screen = document.createElement("main");
  screen.textContent = text;
  return screen;
}

test("keeps the screens a back link can lead up to", () => {
  const screens = new PreviousScreens();
  screens.keep("/settings", screenSaying("Settings"));
  screens.keep("/settings/privacy", screenSaying("Privacy"));

  screens.forgetAllButAbove("/settings/privacy/screenshot-mode");

  expect(screens.of("/settings")?.content.textContent).toBe("Settings");
  expect(screens.of("/settings/privacy")?.content.textContent).toBe("Privacy");
});

test("forgets the screens no back link leads up to", () => {
  const screens = new PreviousScreens();
  screens.keep("/", screenSaying("Library"));
  screens.keep("/history", screenSaying("History"));
  screens.keep(
    "/settings/privacy/screenshot-mode",
    screenSaying("Screenshot mode"),
  );

  screens.forgetAllButAbove("/settings/privacy");

  expect(screens.of("/")).toBeUndefined();
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
