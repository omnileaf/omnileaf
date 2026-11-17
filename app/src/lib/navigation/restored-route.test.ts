import { expect, test, vi } from "vitest";

import { restoredRouteOnce } from "./restored-route";

const SETTINGS_PAGE = "/settings/appearance";

function saved(route: string | null) {
  return vi.fn(() => Promise.resolve({ status: "ok" as const, data: route }));
}

test("hands over the route Android saved for the rebuilt screen", async () => {
  const restoredRoute = restoredRouteOnce(saved(SETTINGS_PAGE));

  const route = await restoredRoute("android");

  expect(route).toBe(SETTINGS_PAGE);
});

test("keeps the query of the saved route", async () => {
  const restoredRoute = restoredRouteOnce(saved("/series/42?tab=books"));

  const route = await restoredRoute("android");

  expect(route).toBe("/series/42?tab=books");
});

test("hands over nothing when Android saved no route", async () => {
  const restoredRoute = restoredRouteOnce(saved(null));

  const route = await restoredRoute("android");

  expect(route).toBeUndefined();
});

test("asks Android once for the page's whole life", async () => {
  const take = saved(SETTINGS_PAGE);
  const restoredRoute = restoredRouteOnce(take);

  const routes = [
    await restoredRoute("android"),
    await restoredRoute("android"),
  ];

  expect(routes).toEqual([SETTINGS_PAGE, undefined]);
  expect(take).toHaveBeenCalledTimes(1);
});

test("reports a failed take and hands over nothing", async () => {
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);
  const error = { code: "internal", message: "timed out" } as const;
  const restoredRoute = restoredRouteOnce(() =>
    Promise.resolve({ status: "error", error }),
  );

  const route = await restoredRoute("android");

  expect(route).toBeUndefined();
  expect(reported).toHaveBeenCalledWith(error);
});

test("doesn't ask anywhere but Android", async () => {
  const take = saved(SETTINGS_PAGE);

  const routes = await Promise.all(
    (["ios", "linux", "macos", "windows"] as const).map((platform) =>
      restoredRouteOnce(take)(platform),
    ),
  );

  expect(routes).toEqual([undefined, undefined, undefined, undefined]);
  expect(take).not.toHaveBeenCalled();
});
