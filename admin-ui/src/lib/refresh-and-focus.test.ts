import { expect, test, vi } from "vitest";

import { refreshAndFocus } from "#lib/refresh-and-focus.ts";

test("moves focus to the heading only after the refresh has finished", async () => {
  const steps: string[] = [];
  let finish: () => void = () => undefined;
  const refresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = () => {
          steps.push("refreshed");
          resolve();
        };
      }),
  );

  const refreshing = refreshAndFocus(refresh, () => {
    steps.push("focused");
  });
  expect(steps).toEqual([]);
  finish();
  await refreshing;

  expect(refresh).toHaveBeenCalledOnce();
  expect(steps).toEqual(["refreshed", "focused"]);
});
