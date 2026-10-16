import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import NeedsAttentionCard from "./NeedsAttentionCard.svelte";

test("says how many things there are to fix", async () => {
  const screen = await render(NeedsAttentionCard, {
    count: 2,
    onOpen: () => undefined,
  });

  await expect
    .element(screen.getByRole("button"))
    .toHaveAccessibleName("Needs attention 2 things to fix");
});

test("opens needs attention when chosen", async () => {
  let opened = 0;
  const screen = await render(NeedsAttentionCard, {
    count: 1,
    onOpen: () => {
      opened += 1;
    },
  });

  await screen.getByRole("button", { name: /^Needs attention/ }).click();

  expect(opened).toBe(1);
});
