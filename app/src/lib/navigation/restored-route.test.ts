import { afterEach, expect, test, vi } from "vitest";

import { savedRoute, showOpeningPage } from "./restored-route";

const SETTINGS_PAGE = "/settings/appearance";

function saved(route: string | null) {
  return vi.fn(() => Promise.resolve({ status: "ok" as const, data: route }));
}

function told() {
  return vi.fn(() => Promise.resolve({ status: "ok" as const, data: null }));
}

function opened() {
  return vi.fn(() => Promise.resolve());
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("hands over the route Android saved for the rebuilt screen", async () => {
  const route = await savedRoute("android", saved(SETTINGS_PAGE));

  expect(route).toBe(SETTINGS_PAGE);
});

test("keeps the query of the saved route", async () => {
  const route = await savedRoute("android", saved("/series/42?tab=books"));

  expect(route).toBe("/series/42?tab=books");
});

test("hands over nothing when Android saved no route", async () => {
  const route = await savedRoute("android", saved(null));

  expect(route).toBeUndefined();
});

test("reports a failed ask and hands over nothing", async () => {
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);
  const error = { code: "internal", message: "timed out" } as const;

  const route = await savedRoute("android", () =>
    Promise.resolve({ status: "error", error }),
  );

  expect(route).toBeUndefined();
  expect(reported).toHaveBeenCalledWith(error);
});

test("doesn't ask anywhere but Android", async () => {
  const ask = saved(SETTINGS_PAGE);

  const routes = await Promise.all(
    (["ios", "linux", "macos", "windows"] as const).map((platform) =>
      savedRoute(platform, ask),
    ),
  );

  expect(routes).toEqual([undefined, undefined, undefined, undefined]);
  expect(ask).not.toHaveBeenCalled();
});

test("opens the restored page", async () => {
  const open = opened();

  await showOpeningPage(SETTINGS_PAGE, "android", open, told());

  expect(open).toHaveBeenCalledWith(SETTINGS_PAGE);
});

test("opens no page when Android saved none", async () => {
  const open = opened();

  await showOpeningPage(undefined, "android", open, told());

  expect(open).not.toHaveBeenCalled();
});

test("tells Android the opening page shows", async () => {
  const tell = told();

  await showOpeningPage(undefined, "android", opened(), tell);

  expect(tell).toHaveBeenCalledTimes(1);
});

test("tells Android only once the restored page has opened", async () => {
  const steps: string[] = [];
  const open = async () => {
    await Promise.resolve();
    steps.push("opened");
  };
  const tell = () => {
    steps.push("told");
    return Promise.resolve({ status: "ok" as const, data: null });
  };

  await showOpeningPage(SETTINGS_PAGE, "android", open, tell);

  expect(steps).toEqual(["opened", "told"]);
});

test("doesn't tell anywhere but Android that the opening page shows", async () => {
  const tell = told();

  await Promise.all(
    (["ios", "linux", "macos", "windows"] as const).map((platform) =>
      showOpeningPage(undefined, platform, opened(), tell),
    ),
  );

  expect(tell).not.toHaveBeenCalled();
});

test("reports Android not hearing that the opening page shows", async () => {
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);
  const error = { code: "internal", message: "timed out" } as const;

  await showOpeningPage(undefined, "android", opened(), () =>
    Promise.resolve({ status: "error", error }),
  );

  expect(reported).toHaveBeenCalledWith(error);
});
