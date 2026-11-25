import { afterEach, expect, test } from "vitest";

import { holdScrollPlace, placeOf } from "./hold-scroll";

const SERIES = "/series/x";
const SCREEN_HEIGHT_PX = 300;
const LINK_HEIGHT_PX = 40;
const GAP_PX = 1000;
const LOWER_LINK_TOP = LINK_HEIGHT_PX + GAP_PX;
const SHOWN_LOWER_LINK_AT = 900;

const stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
  document.body.replaceChildren();
});

function linkTo(text: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = SERIES;
  link.textContent = text;
  link.style.display = "block";
  link.style.height = `${String(LINK_HEIGHT_PX)}px`;
  return link;
}

function gap(): HTMLElement {
  const spacer = document.createElement("div");
  spacer.style.height = `${String(GAP_PX)}px`;
  return spacer;
}

function screenShowingSeriesTwice(): {
  screen: HTMLElement;
  lower: HTMLAnchorElement;
} {
  const screen = document.createElement("main");
  const lower = linkTo("far down");
  screen.style.height = `${String(SCREEN_HEIGHT_PX)}px`;
  screen.style.overflowY = "scroll";
  screen.append(linkTo("near the top"), gap(), lower, gap());
  document.body.append(screen);
  return { screen, lower };
}

function linkTopWithin(screen: HTMLElement, link: Element): number {
  return link.getBoundingClientRect().top - screen.getBoundingClientRect().top;
}

test("brings back the link nearest where it was left when the screen shows the same link twice", () => {
  const { screen, lower } = screenShowingSeriesTwice();
  screen.scrollTop = SHOWN_LOWER_LINK_AT;
  const left = placeOf(screen, undefined);
  screen.scrollTop = 0;

  stops.push(holdScrollPlace(screen, left));

  expect(left.anchor?.offset).toBe(LOWER_LINK_TOP - SHOWN_LOWER_LINK_AT);
  expect(linkTopWithin(screen, lower)).toBe(left.anchor?.offset);
});

test("goes back to the saved scroll position when no link shows the saved address", () => {
  const { screen } = screenShowingSeriesTwice();
  const left = { top: 500, anchor: { href: "/series/gone", offset: 20 } };

  stops.push(holdScrollPlace(screen, left));

  expect(screen.scrollTop).toBe(left.top);
});
