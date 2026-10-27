import { expect, test } from "vitest";

import { m } from "#lib/paraglide/messages.js";

import { arrivalNotice } from "./home-arrival";

const LOCATION = "/media/Sample Library";

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
