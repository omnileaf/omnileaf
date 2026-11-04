import { createRawSnippet, type Component } from "svelte";
import { render } from "svelte/server";
import { expect } from "vitest";

export function words(text: string) {
  return createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));
}

export function html<Props extends Record<string, unknown>>(
  component: Component<Props>,
  props: NoInfer<Props>,
): string {
  return render(component, { props }).body;
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
