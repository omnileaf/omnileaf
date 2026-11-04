import { expect, test } from "vitest";

import { html, tokensOf, words } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";
import type { SignOutState } from "#lib/sign-out-control.svelte.ts";

import AppShell from "./app-shell.svelte";

const LINK = /<a\b[^>]*>/g;

function shell(props: { pathname?: string; signOut?: SignOutState } = {}) {
  return html(AppShell, {
    login: "reviewer",
    pathname: "/admin",
    signOut: { kind: "idle" },
    onSignOut: () => undefined,
    children: words("Page content"),
    ...props,
  });
}

function anchorTo(markup: string, href: string): string {
  const anchor = (markup.match(LINK) ?? []).find((tag) =>
    tag.includes(`href="${href}"`),
  );
  return anchor ?? "";
}

test("offers a skip link to the content before anything else", () => {
  const markup = shell();

  expect(markup.indexOf(copy.shell.skipLink)).toBeGreaterThan(-1);
  expect(markup.indexOf(copy.shell.skipLink)).toBeLessThan(
    markup.indexOf("<header"),
  );
  expect(anchorTo(markup, "#main")).toContain("<a");
});

test("keeps the page in a focusable main landmark named main", () => {
  const markup = shell();

  expect(markup).toMatch(/<main\b[^>]*\sid="main"[^>]*\stabindex="-1"/);
  expect(markup).toMatch(/<main\b[^>]*>[\s\S]*Page content[\s\S]*<\/main>/);
});

test("links the brand to the dashboard", () => {
  const markup = shell();

  expect(markup).toMatch(
    new RegExp(`<a\\b[^>]*href="/admin/"[^>]*>[\\s\\S]*?${copy.appName}`),
  );
});

test("lists the dashboard and the reports in a navigation named main", () => {
  const markup = shell();

  expect(markup).toMatch(/<nav\b[^>]*aria-label="Main"/);
  expect(anchorTo(markup, "/admin/")).toContain("<a");
  expect(anchorTo(markup, "/admin/reports")).toContain("<a");
});

test.each([
  ["/admin", "/admin/"],
  ["/admin/reports", "/admin/reports"],
  ["/admin/reports/R-1111-1111", "/admin/reports"],
])("marks the section of %s as the current page", (pathname, current) => {
  const markup = shell({ pathname });
  const nav = /<nav\b[\s\S]*<\/nav>/.exec(markup)?.[0] ?? "";
  const marked = (nav.match(LINK) ?? []).filter((tag) =>
    tag.includes('aria-current="page"'),
  );

  expect(marked).toHaveLength(1);
  expect(marked[0]).toContain(`href="${current}"`);
});

test("marks no navigation link as current outside the two sections", () => {
  expect(shell({ pathname: "/admin/elsewhere" })).not.toContain(
    'aria-current="page"',
  );
});

test("sizes the navigation links for a phone and for the tablet width", () => {
  const tokens = tokensOf(anchorTo(shell(), "/admin/reports"), /<a\b[^>]*>/);

  expect(tokens).toEqual(
    expect.arrayContaining(["block-11", "tablet:block-9", "flex-1"]),
  );
});

test("shows who is signed in, spoken on a phone and seen from the tablet width", () => {
  const markup = shell();
  const label = /<span\b[^>]*>\s*Signed in as/.exec(markup)?.[0] ?? "";

  expect(markup).toContain(copy.shell.signedInAs);
  expect(markup).toContain("reviewer");
  expect(tokensOf(label, /<span\b[^>]*>/)).toEqual(
    expect.arrayContaining(["sr-only", "tablet:not-sr-only"]),
  );
  expect(tokensOf(label, /<span\b[^>]*>/)).not.toContain("not-sr-only");
});

test("signs out with a button that shows an icon and the word at every width", () => {
  const markup = shell();
  const button = /<button\b[^>]*>/.exec(markup)?.[0] ?? "";
  const label = /<button\b[^>]*>([\s\S]*?)<\/button>/.exec(markup)?.[1] ?? "";

  expect(button).toContain('type="button"');
  expect(button).not.toContain("aria-label");
  expect(button).not.toContain("title=");
  expect(label.replace(/<!--.*?-->/gs, "")).toMatch(
    /<svg\b[\s\S]*Sign out\s*$/,
  );
  expect(tokensOf(button, /<button\b[^>]*>/)).toEqual(
    expect.arrayContaining(["block-11", "tablet:block-9", "px-4"]),
  );
  expect(tokensOf(button, /<button\b[^>]*>/)).not.toContain("inline-11");
});

test("announces a failed sign out in an alert", () => {
  const markup = shell({
    signOut: { kind: "failed", message: copy.errors.csrfRejected },
  });

  expect(markup).toMatch(/role="alert"/);
  expect(markup).toContain(copy.shell.signOutFailed);
  expect(markup).toContain(copy.errors.csrfRejected);
});

test("shows no alert while nothing went wrong or while signing out", () => {
  expect(shell()).not.toContain('role="alert"');
  expect(shell({ signOut: { kind: "pending" } })).not.toContain('role="alert"');
});

test("disables the sign out button while the service answers", () => {
  const button = (markup: string) => /<button\b[^>]*>/.exec(markup)?.[0] ?? "";

  expect(button(shell({ signOut: { kind: "pending" } }))).toMatch(
    /\sdisabled(?:[=\s>])/,
  );
  expect(button(shell())).not.toMatch(/\sdisabled(?:[=\s>])/);
  expect(
    button(shell({ signOut: { kind: "failed", message: "x" } })),
  ).not.toMatch(/\sdisabled(?:[=\s>])/);
});

test("never emits an inline style", () => {
  expect(shell({ signOut: { kind: "failed", message: "x" } })).not.toMatch(
    /\sstyle=/,
  );
});

test("makes the brand link as tall as the other controls", () => {
  const brand = /<a\b[^>]*>(?=\s*<span[^>]*bg-accent)/.exec(shell())?.[0] ?? "";

  expect(tokensOf(brand, /<a\b[^>]*>/)).toEqual(
    expect.arrayContaining(["block-11", "tablet:block-9"]),
  );
});

test("makes every link and button 44px high on a phone and 36px from the tablet width", () => {
  const controls = shell().match(/<(?:a|button)\b[^>]*>/g) ?? [];

  expect(controls.length).toBeGreaterThanOrEqual(5);
  for (const control of controls) {
    const tokens = tokensOf(control, /<[a-z]+\b[^>]*>/);
    expect(
      tokens.includes("block-11") || tokens.includes("focus:block-11"),
      control,
    ).toBe(true);
    expect(
      tokens.includes("tablet:block-9") ||
        tokens.includes("tablet:focus:block-9"),
      control,
    ).toBe(true);
  }
});
