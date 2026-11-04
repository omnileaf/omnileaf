import { createRawSnippet, type Component } from "svelte";
import { render } from "svelte/server";
import { expect } from "vitest";

import { unwrittenClasses } from "#lib/tailwind-source.ts";

export const CONSUMER_CLASS = "consumer-class";

export function words(text: string) {
  return createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));
}

export function renderPage<Props extends Record<string, unknown>>(
  component: Component<Props>,
  props: NoInfer<Props>,
): { readonly body: string; readonly head: string } {
  const output = render(component, { props });
  const unwritten = unwrittenClasses(output.body + output.head);
  if (unwritten.length > 0) {
    throw new Error(
      `${component.name} rendered in "${expect.getState().currentTestName ?? "a test"}" with ${unwritten.join(", ")}, not written in full in any file Tailwind scans (a class that only an @source inline safelist generates is not seen)`,
    );
  }
  return output;
}

export function html<Props extends Record<string, unknown>>(
  component: Component<Props>,
  props: NoInfer<Props>,
): string {
  return renderPage(component, props).body;
}

export function tokensOf(markup: string, element: RegExp): string[] {
  const tag = element.exec(markup)?.[0] ?? "";
  const classes = /\sclass="([^"]*)"/.exec(tag)?.[1] ?? "";
  return classes.split(/\s+/).filter((token) => token !== "");
}

export function expectOwnLook(
  looks: Readonly<Record<string, readonly string[]>>,
  key: string,
  tokens: readonly string[],
): void {
  const own = looks[key] ?? [];
  expect(tokens).toEqual(expect.arrayContaining([...own]));
  const foreign = Object.entries(looks)
    .filter(([other]) => other !== key)
    .flatMap(([, others]) => others)
    .filter((token) => !own.includes(token));
  expect(tokens.filter((token) => foreign.includes(token))).toEqual([]);
}
