import { afterEach, expect, test } from "vitest";

import {
  isBackTakenByScreen,
  takeBackWithinScreen,
  willScreenTakeBack,
} from "./back-within-screen";

const stopTaking: (() => void)[] = [];

function openLayer(name: string, closed: string[]): void {
  stopTaking.push(
    takeBackWithinScreen(() => {
      closed.push(name);
    }),
  );
}

afterEach(() => {
  for (const stop of stopTaking.splice(0)) {
    stop();
  }
});

test("closes only the layer opened last", () => {
  const closed: string[] = [];
  openLayer("panel", closed);
  openLayer("menu", closed);

  const isTaken = isBackTakenByScreen();

  expect(closed).toEqual(["menu"]);
  expect(isTaken).toBe(true);
});

test("tells a back gesture will be taken while a layer is open", () => {
  const closed: string[] = [];
  openLayer("panel", closed);

  const willTake = willScreenTakeBack();

  expect(willTake).toBe(true);
  expect(closed).toEqual([]);
});

test("leaves a back gesture to the app once no layer is open", () => {
  const willTake = willScreenTakeBack();

  expect(willTake).toBe(false);
  expect(isBackTakenByScreen()).toBe(false);
});
