import type { ComponentProps } from "svelte";
import { expect, expectTypeOf, test } from "vitest";

import { html, tokensOf, words } from "#lib/components/ui/render.ts";

import PageHead from "./page-head.svelte";

test("titles the page with a first level heading that script can focus", () => {
  const markup = html(PageHead, { title: "Dashboard" });

  expect(markup).toMatch(/<h1\b[^>]*\stabindex="-1"[^>]*>Dashboard<\/h1>/);
  expect(tokensOf(markup, /<h1\b[^>]*>/)).toEqual(
    expect.arrayContaining(["text-title", "font-semibold"]),
  );
});

test("sets the subtitle in small muted text under the title", () => {
  const markup = html(PageHead, {
    title: "Dashboard",
    subtitle: "Over the newest 500 reports",
  });

  expect(markup).toMatch(/<p\b[^>]*>Over the newest 500 reports<\/p>/);
  expect(tokensOf(markup, /<p\b[^>]*>/)).toEqual(
    expect.arrayContaining(["text-small", "text-muted"]),
  );
});

test("writes no subtitle paragraph without one", () => {
  expect(html(PageHead, { title: "Reports" })).not.toContain("<p");
});

test("renders the page actions beside the title", () => {
  const markup = html(PageHead, {
    title: "Reports",
    actions: words("Refresh"),
  });

  expect(markup).toContain("Refresh");
  expect(markup.indexOf("</h1>")).toBeLessThan(markup.indexOf("Refresh"));
});

function paragraphs(markup: string): { tokens: string[]; text: string }[] {
  return [...markup.matchAll(/(<p\b[^>]*>)([\s\S]*?)<\/p>/g)].map(
    ([, tag = "", text = ""]) => ({
      tokens: tokensOf(tag, /<p\b[^>]*>/),
      text: text.replace(/<!--.*?-->/gs, "").trim(),
    }),
  );
}

test("shows a plain subtitle at every width", () => {
  const [only, ...rest] = paragraphs(
    html(PageHead, { title: "Reports", subtitle: "Words" }),
  );

  expect(rest).toEqual([]);
  expect(only?.text).toBe("Words");
  expect(only?.tokens).not.toContain("hidden");
  expect(only?.tokens).not.toContain("tablet:hidden");
});

test("keeps a tablet subtitle out of a phone layout and its accessibility tree", () => {
  const [only, ...rest] = paragraphs(
    html(PageHead, { title: "Reports", subtitle: { tablet: "Words" } }),
  );

  expect(rest).toEqual([]);
  expect(only?.text).toBe("Words");
  expect(only?.tokens).toEqual(
    expect.arrayContaining(["hidden", "tablet:block"]),
  );
});

test("swaps a phone subtitle for a tablet one at the tablet width", () => {
  const [phone, tablet, ...rest] = paragraphs(
    html(PageHead, {
      title: "Dashboard",
      subtitle: { phone: "Short", tablet: "Longer" },
    }),
  );

  expect(rest).toEqual([]);
  expect(phone?.text).toBe("Short");
  expect(phone?.tokens).toContain("tablet:hidden");
  expect(tablet?.text).toBe("Longer");
  expect(tablet?.tokens).toEqual(
    expect.arrayContaining(["hidden", "tablet:block"]),
  );
});

type Subtitle = NonNullable<ComponentProps<typeof PageHead>["subtitle"]>;

test("accepts only subtitles that say something at the tablet width", () => {
  expectTypeOf<string>().toExtend<Subtitle>();
  expectTypeOf<{ tablet: string }>().toExtend<Subtitle>();
  expectTypeOf<{ phone: string; tablet: string }>().toExtend<Subtitle>();
  expectTypeOf<{ tablet: undefined }>().not.toExtend<Subtitle>();
  expectTypeOf<{ phone: string }>().not.toExtend<Subtitle>();
  expect(true).toBe(true);
});
