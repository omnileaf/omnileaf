import { expect, test } from "vitest";

import { pathSegment } from "#lib/path-segment.ts";

test("leaves a report code as it is", () => {
  expect(pathSegment("R-2222-2222")).toBe("R-2222-2222");
});

test.each([
  ["a/b", "a%2Fb"],
  ["/x", "%2Fx"],
  ["a?b#c", "a%3Fb%23c"],
  ["%41", "%2541"],
  ["two words", "two%20words"],
])("keeps %j in one path segment", (code, segment) => {
  expect(pathSegment(code)).toBe(segment);
});
