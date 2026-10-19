import { expect, test } from "vitest";

import { lowSpaceNotice } from "./low-space-notice";

const FREE = 1_100_000_000;

test("warns a phone that it's almost out of space and what's cleared first", () => {
  const notice = lowSpaceNotice(FREE, "phone", () => undefined);

  expect({
    tone: notice.tone,
    title: notice.title,
    body: notice.body,
    action: notice.action?.label,
  }).toEqual({
    tone: "warning",
    title: "Almost out of space",
    body: "1.1 GB left on this phone. Omnileaf clears the oldest cached pages and covers first.",
    action: "Free up space",
  });
});

test("names the computer on a desktop", () => {
  expect(lowSpaceNotice(FREE, "computer", () => undefined).body).toBe(
    "1.1 GB left on this computer. Omnileaf clears the oldest cached pages and covers first.",
  );
});

test("names the tablet on a tablet", () => {
  expect(lowSpaceNotice(FREE, "tablet", () => undefined).body).toBe(
    "1.1 GB left on this tablet. Omnileaf clears the oldest cached pages and covers first.",
  );
});

test("frees up space from its button", () => {
  let asked = 0;
  const notice = lowSpaceNotice(FREE, "phone", () => {
    asked += 1;
  });

  notice.action?.run();

  expect(asked).toBe(1);
});
