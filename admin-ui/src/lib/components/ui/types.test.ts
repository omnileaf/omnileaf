import type { ComponentProps } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { expect, expectTypeOf, test } from "vitest";

import type { WithElementRef } from "./types.ts";
import { Badge } from "./badge/index.ts";
import { Button } from "./button/index.ts";

test("refuses an inline style on the shared element props", () => {
  expectTypeOf<
    WithElementRef<HTMLAttributes<HTMLDivElement>>
  >().not.toHaveProperty("style");
  expectTypeOf<WithElementRef<HTMLAttributes<HTMLDivElement>>>().toHaveProperty(
    "class",
  );
  expect(true).toBe(true);
});

test("refuses an inline style on a button and a badge", () => {
  expectTypeOf<ComponentProps<typeof Button>>().not.toHaveProperty("style");
  expectTypeOf<ComponentProps<typeof Badge>>().not.toHaveProperty("style");
  expect(true).toBe(true);
});

test("requires a name for an icon button", () => {
  type Props = ComponentProps<typeof Button>;

  expectTypeOf<{ size: "icon" }>().not.toExtend<Props>();
  expectTypeOf<{ size: "icon"; "aria-label": string }>().toExtend<Props>();
  expectTypeOf<{
    size: "icon";
    "aria-labelledby": string;
  }>().toExtend<Props>();
  expectTypeOf<{ size: "lg" }>().toExtend<Props>();
  expect(true).toBe(true);
});
