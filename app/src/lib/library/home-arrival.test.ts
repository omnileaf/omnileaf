import { expect, test } from "vitest";

import { m } from "#lib/paraglide/messages.js";

import type { LibraryFolder } from "#lib/ipc/bindings.ts";

import {
  arrivalNotice,
  homeArrivalNotice,
  takeHomeArrival,
} from "./home-arrival";

const LOCATION = "/media/Sample Library";

const HOME: LibraryFolder = {
  id: "1" as LibraryFolder["id"],
  kind: "home",
  name: "Sample Library",
  location: LOCATION,
  isAvailable: true,
};

test("says the library moved, and where to", () => {
  const notice = arrivalNotice("moved", LOCATION);

  expect([notice?.tone, notice?.title, notice?.body]).toEqual([
    "plain",
    m.home_moved_title(),
    m.home_moved_body({ location: LOCATION }),
  ]);
});

test("warns that the library couldn't move and stays where it was", () => {
  const notice = arrivalNotice("moveFailed", LOCATION);

  expect([notice?.tone, notice?.title, notice?.body]).toEqual([
    "warning",
    m.home_move_failed_title(),
    m.home_move_failed_body({ location: LOCATION }),
  ]);
});

test("says nothing when the home folder didn't move", () => {
  const notice = arrivalNotice(null, LOCATION);

  expect(notice).toBeUndefined();
});

test("says where the library moved to, from the home folder in the list", () => {
  const notice = homeArrivalNotice(
    "moved",
    { kind: "loaded", home: HOME, linked: [] },
    "linux",
  );

  expect(notice?.body).toBe(m.home_moved_body({ location: LOCATION }));
});

test("says nothing while the home folder isn't known", () => {
  const notices = [
    homeArrivalNotice("moved", { kind: "loading" }, "linux"),
    homeArrivalNotice("moveFailed", { kind: "failed" }, "linux"),
  ];

  expect(notices).toEqual([undefined, undefined]);
});

test("hands over how the home arrived only the first time it's asked", () => {
  const taken = [takeHomeArrival("moved"), takeHomeArrival("moved")];

  expect(taken).toEqual(["moved", null]);
});
