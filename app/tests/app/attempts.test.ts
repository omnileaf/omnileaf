import { expect, test } from "vitest";

import { withAttempts } from "./attempts.ts";

test("returns the first attempt that succeeds", async () => {
  const tried: number[] = [];

  const result = await withAttempts(3, (number) => {
    tried.push(number);
    return number < 2
      ? Promise.reject(new Error(`attempt ${String(number)} hung`))
      : Promise.resolve("ready");
  });

  expect(result).toBe("ready");
  expect(tried).toEqual([1, 2]);
});

test("reports every failure when no attempt succeeds", async () => {
  const run = withAttempts(2, (number) =>
    Promise.reject(new Error(`attempt ${String(number)} hung`)),
  );

  await expect(run).rejects.toThrow(
    "failed 2 times: attempt 1 hung; attempt 2 hung",
  );
});

test("fails at once on a failure it should not retry", async () => {
  const tried: number[] = [];
  const broken = new Error("not installed");

  const run = withAttempts(
    3,
    (number) => {
      tried.push(number);
      return Promise.reject(number === 1 ? new Error("hung") : broken);
    },
    (error) => error instanceof Error && error.message === "hung",
  );

  await expect(run).rejects.toBe(broken);
  expect(tried).toEqual([1, 2]);
});
