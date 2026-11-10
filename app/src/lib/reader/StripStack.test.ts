import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import StripStackHarness from "./StripStackHarness.svelte";

function strip(): HTMLElement {
  const element = document.querySelector("[data-strip]");
  if (!(element instanceof HTMLElement)) {
    throw new Error("the harness drew no strip");
  }
  return element;
}

async function scrolled(element: HTMLElement, top: number): Promise<void> {
  const scrolling = new Promise((resolve) => {
    element.addEventListener("scroll", resolve, { once: true });
  });
  element.scrollTop = top;
  await scrolling;
}

function twoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

test("goes quietly when it is taken away while a scroll is still being reported", async () => {
  document.body.replaceChildren();
  const thrown: unknown[] = [];
  const keep = (event: ErrorEvent): void => {
    thrown.push(event.error);
    event.preventDefault();
  };
  window.addEventListener("error", keep);
  const shown = await render(StripStackHarness, { isShown: true });
  await scrolled(strip(), 200);

  await shown.rerender({ isShown: false });
  await twoFrames();

  window.removeEventListener("error", keep);
  expect(thrown).toEqual([]);
});
