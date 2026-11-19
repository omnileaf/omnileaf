import { expect, test } from "vitest";

import { reportFailure } from "./report-failure.ts";

test("reports to the window even when another object calls it", () => {
  const failure = new Error("the storage check broke");
  const reported: unknown[] = [];
  const listen = (event: ErrorEvent): void => {
    reported.push(event.error);
    event.preventDefault();
  };
  const holder = { onError: reportFailure };
  window.addEventListener("error", listen);

  holder.onError(failure);
  window.removeEventListener("error", listen);

  expect(reported).toEqual([failure]);
});
