import { afterEach, expect, test } from "vitest";

import "../../app.css";

const TRANSPARENT = "rgba(0, 0, 0, 0)";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.platform;
});

test("leaves the window's own colour showing until the theme is known", () => {
  const ground = getComputedStyle(document.body).backgroundColor;

  expect(ground).toBe(TRANSPARENT);
});

test("paints the page once the theme is known", () => {
  document.documentElement.dataset.platform = "android";
  document.documentElement.dataset.theme = "dark";

  const ground = getComputedStyle(document.body).backgroundColor;

  expect(ground).toBe("rgb(11, 15, 12)");
});
