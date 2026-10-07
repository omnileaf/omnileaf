import { expect, test } from "vitest";

import { needsFirstLaunch } from "./gate";

test("shows the first launch until the device has finished it", () => {
  const needed = [
    needsFirstLaunch({ status: "ok", data: false }),
    needsFirstLaunch({ status: "ok", data: true }),
  ];

  expect(needed).toEqual([true, false]);
});

test("opens on the library when the device can't say whether it finished", () => {
  const needed = needsFirstLaunch({
    status: "error",
    error: { code: "internal", message: "from the backend" },
  });

  expect(needed).toBe(false);
});
