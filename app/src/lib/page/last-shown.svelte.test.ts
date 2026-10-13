import { flushSync } from "svelte";
import { expect, test } from "vitest";

import { lastShown } from "./last-shown.svelte.ts";

function watch(first: string | undefined) {
  let asked = $state(first);
  let shown: { readonly current: string | undefined } = { current: undefined };
  const stop = $effect.root(() => {
    shown = lastShown(() => asked);
  });
  flushSync();
  return {
    shown: () => shown.current,
    ask: (next: string | undefined) => {
      asked = next;
      flushSync();
    },
    stop,
  };
}

test("shows what is asked about", () => {
  const watching = watch("Sample Comics");

  watching.ask("Sample Library");

  expect(watching.shown()).toBe("Sample Library");
  watching.stop();
});

test("keeps showing the last thing asked about once nothing is", () => {
  const watching = watch("Sample Comics");

  watching.ask(undefined);

  expect(watching.shown()).toBe("Sample Comics");
  watching.stop();
});

test("shows nothing before anything is asked about", () => {
  const watching = watch(undefined);

  expect(watching.shown()).toBeUndefined();
  watching.stop();
});
