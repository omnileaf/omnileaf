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

function screenShowingSeriesTwice(): HTMLElement {
  const screen = document.createElement("main");
  screen.style.height = `${String(SCREEN_HEIGHT_PX)}px`;
  screen.style.overflowY = "scroll";
  screen.innerHTML = `
    <div>
      <a href="${SERIES}" style="display:block;height:${String(LINK_HEIGHT_PX)}px">near the top</a>
      <div style="height:${String(GAP_PX)}px"></div>
      <a href="${SERIES}" style="display:block;height:${String(LINK_HEIGHT_PX)}px">far down</a>
      <div style="height:${String(GAP_PX)}px"></div>
    </div>`;
  document.body.append(screen);
  return screen;
}

function linkTopWithin(screen: HTMLElement, link: Element): number {
  return link.getBoundingClientRect().top - screen.getBoundingClientRect().top;
}

test("brings back the link nearest where it was left when the screen shows the same link twice", () => {
  const screen = screenShowingSeriesTwice();
  screen.scrollTop = SHOWN_LOWER_LINK_AT;
  const left = placeOf(screen, undefined);
  screen.scrollTop = 0;

  stops.push(holdScrollPlace(screen, left));

  const [, lower] = screen.querySelectorAll("a");
  expect(left.anchor?.offset).toBe(LOWER_LINK_TOP - SHOWN_LOWER_LINK_AT);
  expect(linkTopWithin(screen, lower)).toBe(left.anchor?.offset);
});

test("goes back to the saved scroll position when no link shows the saved address", () => {
  const screen = screenShowingSeriesTwice();
  const left = { top: 500, anchor: { href: "/series/gone", offset: 20 } };

  stops.push(holdScrollPlace(screen, left));

  expect(screen.scrollTop).toBe(left.top);
});
