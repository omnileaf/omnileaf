import { expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { xpath } from "./webdriver.ts";

const PAGE_HEADING = xpath("//h1");
const SETTINGS_LINK = xpath("//nav//a[normalize-space()='Settings']");
const ABOUT_LINK = xpath("//main//a[starts-with(normalize-space(), 'About')]");
const VERSION_CAPTION = xpath(
  "//p[starts-with(normalize-space(), 'Version ')]",
);

const appSession = useAppSession();

test("opens on the empty library", async () => {
  const heading = await appSession().waitFor(PAGE_HEADING);

  expect(await heading.text()).toBe("Library");
});

test("shows the version the Rust core reports in Settings › About", async () => {
  await (await appSession().waitFor(SETTINGS_LINK)).click();
  await (await appSession().waitFor(ABOUT_LINK)).click();

  const caption = await appSession().waitFor(VERSION_CAPTION);

  expect(await caption.text()).toMatch(/^Version \d+\.\d+\.\d+$/);
});
