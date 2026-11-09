import { expect, test } from "vitest";

import { html, tokensOf, words } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./index.ts";

test("names the breadcrumb trail for assistive technology", () => {
  const markup = html(Breadcrumb, { children: words("") });

  expect(markup).toContain("<nav");
  expect(markup).toContain(`aria-label="${copy.breadcrumb}"`);
});

test("lists the steps in an ordered list that wraps", () => {
  const markup = html(BreadcrumbList, { children: words("") });

  expect(markup).toContain("<ol");
  expect(tokensOf(markup, /<ol\b[^>]*>/)).toEqual(
    expect.arrayContaining(["flex", "flex-wrap", "text-small", "text-muted"]),
  );
  expect(html(BreadcrumbItem, { children: words("") })).toContain("<li");
});

test("links an earlier step with a focus ring", () => {
  const markup = html(BreadcrumbLink, {
    href: "/admin/reports",
    children: words("Reports"),
  });

  expect(markup).toContain('href="/admin/reports"');
  expect(tokensOf(markup, /<a\b[^>]*>/)).toEqual(
    expect.arrayContaining([
      "focus-visible:outline-2",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-accent",
      "hover:text-foreground",
      "hover:underline",
    ]),
  );
});

test("makes a link 44px tall on a phone and at least 24px from the tablet width up", () => {
  const markup = html(BreadcrumbLink, {
    href: "/x",
    children: words("Reports"),
  });

  expect(tokensOf(markup, /<a\b[^>]*>/)).toEqual(
    expect.arrayContaining([
      "inline-flex",
      "items-center",
      "min-block-11",
      "tablet:min-block-6",
    ]),
  );
});

test("marks the current page without making it a link", () => {
  const markup = html(BreadcrumbPage, { children: words("R-1111-1111") });

  expect(markup).toContain('aria-current="page"');
  expect(markup).not.toContain("<a");
  expect(tokensOf(markup, /<span\b[^>]*>/)).toEqual(
    expect.arrayContaining(["font-semibold", "text-foreground"]),
  );
});

test("hides the separator between steps from assistive technology", () => {
  const markup = html(BreadcrumbSeparator, {});

  expect(markup).toMatch(/<li\b[^>]*role="presentation"/);
  expect(markup).toMatch(/<li\b[^>]*aria-hidden="true"/);
  expect(tokensOf(markup, /<svg\b[^>]*>/)).toEqual(
    expect.arrayContaining(["lucide-chevron-right", "rtl:rotate-180"]),
  );
});
