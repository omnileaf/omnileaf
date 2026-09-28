import { expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { xpath } from "./webdriver.ts";

const LIBRARY_HEADING = xpath("//h1");
const VERSION_CAPTION = xpath(
  "//p[starts-with(normalize-space(), 'Version ')]",
);

const appSession = useAppSession();

test("opens on the empty library", async () => {
  const heading = await appSession().waitFor(LIBRARY_HEADING);

  expect(await heading.text()).toBe("Library");
});

test("shows the version the Rust core reports", async () => {
  const caption = await appSession().waitFor(VERSION_CAPTION);

  expect(await caption.text()).toMatch(/^Version \d+\.\d+\.\d+$/);
});
