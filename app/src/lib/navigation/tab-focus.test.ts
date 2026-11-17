import { afterEach, expect, test } from "vitest";

import { focusedTabHref, focusTab } from "./tab-focus";

afterEach(() => {
  document.body.replaceChildren();
});

function place(html: string): void {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
}

function linkTo(href: string, within: string): HTMLAnchorElement {
  const link = document.querySelector<HTMLAnchorElement>(
    `${within} a[href="${href}"]`,
  );
  if (link === null) {
    throw new Error(`no link to ${href} in ${within}`);
  }
  return link;
}

test("notes the tab the app's navigation has focused", () => {
  place('<nav data-app-navigation><a href="/history">History</a></nav>');
  linkTo("/history", "[data-app-navigation]").focus();

  expect(focusedTabHref()).toBe("/history");
});

test("notes nothing for a focused link in a page's own navigation", () => {
  place('<main><nav><a href="/settings">Settings</a></nav></main>');
  linkTo("/settings", "main nav").focus();

  expect(focusedTabHref()).toBeUndefined();
});

test("focuses the shown tab rather than a hidden page link to the same place", () => {
  place(
    '<main><nav hidden><a href="/settings">Settings</a></nav></main><nav data-app-navigation><a href="/settings">Settings</a></nav>',
  );

  focusTab("/settings");

  expect(document.activeElement).toBe(
    linkTo("/settings", "[data-app-navigation]"),
  );
});

test("leaves a page link to the same place alone", () => {
  place(
    '<main><nav><a href="/settings">Settings</a></nav></main><nav data-app-navigation><a href="/settings">Settings</a></nav>',
  );

  focusTab("/settings");

  expect(document.activeElement).toBe(
    linkTo("/settings", "[data-app-navigation]"),
  );
});
