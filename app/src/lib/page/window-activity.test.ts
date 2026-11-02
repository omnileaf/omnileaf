import { afterEach, expect, test } from "vitest";

import { followWindowActivity } from "./window-activity";

const root = document.documentElement;

afterEach(() => {
  root.removeAttribute("data-window-active");
});

test("marks the page inactive while the window has lost focus", () => {
  const stop = followWindowActivity(window);

  window.dispatchEvent(new Event("blur"));

  expect(root.dataset.windowActive).toBe("false");
  stop();
});

test("clears the mark once the window has focus again", () => {
  const stop = followWindowActivity(window);
  window.dispatchEvent(new Event("blur"));

  window.dispatchEvent(new Event("focus"));

  expect(root.hasAttribute("data-window-active")).toBe(false);
  stop();
});

test("stops following once told to", () => {
  const stop = followWindowActivity(window);
  stop();

  window.dispatchEvent(new Event("blur"));

  expect(root.hasAttribute("data-window-active")).toBe(false);
});
