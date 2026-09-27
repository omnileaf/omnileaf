import { afterAll, beforeAll, expect, inject, test } from "vitest";

import { Session, xpath } from "./webdriver.ts";

const LIBRARY_HEADING = xpath("//h1");
const VERSION_CAPTION = xpath(
  "//p[starts-with(normalize-space(), 'Version ')]",
);

let session: Session;

beforeAll(async () => {
  const app = inject("appUnderTest");
  session = await Session.start(new URL(app.server), app.capabilities);
});

afterAll(async () => {
  await session.end();
});

test("opens on the empty library", async () => {
  const heading = await session.waitFor(LIBRARY_HEADING);

  expect(await heading.text()).toBe("Library");
});

test("shows the version the Rust core reports", async () => {
  const caption = await session.waitFor(VERSION_CAPTION);

  expect(await caption.text()).toMatch(/^Version \d+\.\d+\.\d+$/);
});
