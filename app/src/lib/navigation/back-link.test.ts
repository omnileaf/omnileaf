import { afterEach, expect, test } from "vitest";

import { shownBackLink, wayBackFrom } from "./back-link";

afterEach(() => {
  document.body.replaceChildren();
});

function place(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

test("finds the way back a page shows", () => {
  const root = place('<a href="/settings" data-back-link>Settings</a>');

  expect(shownBackLink(root)?.getAttribute("href")).toBe("/settings");
});

test("passes over a way back that's hidden for another one shown", () => {
  const root = place(
    '<a href="/hidden" data-back-link hidden>Hidden</a><a href="/settings/general" data-crumb-back>General</a>',
  );

  expect(shownBackLink(root)?.getAttribute("href")).toBe("/settings/general");
});

test("finds nothing on a page with no way back", () => {
  const root = place('<a href="/browse">Browse</a>');

  expect(shownBackLink(root)).toBeUndefined();
});

test("takes the screen's own way back before one shown beside it, as the collapsed tab bar's", () => {
  place('<a href="/" data-back-link>Back to the library</a>');
  const screen = place('<a href="/series/1" data-back-link>Series</a>');
  const bare = place("<p>Search</p>");

  expect([
    wayBackFrom(screen)?.getAttribute("href"),
    wayBackFrom(bare)?.getAttribute("href"),
  ]).toEqual(["/series/1", "/"]);
});
