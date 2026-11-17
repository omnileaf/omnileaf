import { expect, test, vi } from "vitest";

import { takeRestoredRoute, tellRestoredRouteShown } from "./restored-route";

const SETTINGS_PAGE = "/settings/appearance";

function saved(route: string | null) {
  return vi.fn(() => Promise.resolve({ status: "ok" as const, data: route }));
}

test("hands over the route Android saved for the rebuilt screen", async () => {
  const route = await takeRestoredRoute("android", saved(SETTINGS_PAGE));

  expect(route).toBe(SETTINGS_PAGE);
});

test("keeps the query of the saved route", async () => {
  const route = await takeRestoredRoute(
    "android",
    saved("/series/42?tab=books"),
  );

  expect(route).toBe("/series/42?tab=books");
});

test("hands over nothing when Android saved no route", async () => {
  const route = await takeRestoredRoute("android", saved(null));

  expect(route).toBeUndefined();
});

test("reports a failed take and hands over nothing", async () => {
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);
  const error = { code: "internal", message: "timed out" } as const;

  const route = await takeRestoredRoute("android", () =>
    Promise.resolve({ status: "error", error }),
  );

  expect(route).toBeUndefined();
  expect(reported).toHaveBeenCalledWith(error);
});

test("doesn't ask anywhere but Android", async () => {
  const ask = saved(SETTINGS_PAGE);

  const routes = await Promise.all(
    (["ios", "linux", "macos", "windows"] as const).map((platform) =>
      takeRestoredRoute(platform, ask),
    ),
  );

  expect(routes).toEqual([undefined, undefined, undefined, undefined]);
  expect(ask).not.toHaveBeenCalled();
});

test("tells Android the restored page shows", async () => {
  const tell = vi.fn(() =>
    Promise.resolve({ status: "ok" as const, data: null }),
  );

  await tellRestoredRouteShown(tell);

  expect(tell).toHaveBeenCalledTimes(1);
});

test("reports Android not hearing that the restored page shows", async () => {
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);
  const error = { code: "internal", message: "timed out" } as const;

  await tellRestoredRouteShown(() =>
    Promise.resolve({ status: "error", error }),
  );

  expect(reported).toHaveBeenCalledWith(error);
});
