import { expect, test } from "vitest";

import { mainNavigationLink, useAppSession } from "./app-session.ts";
import { xpath } from "./webdriver.ts";

const PAGE_HEADING = xpath("//h1");
const SETTINGS_LINK = mainNavigationLink("Settings");
const ABOUT_LINK = xpath("//main//a[starts-with(normalize-space(), 'About')]");
const VERSION = xpath(
  "//main//p[starts-with(normalize-space(), 'Version ')] | //main//span[normalize-space()='Version']/following-sibling::span",
);

const appSession = useAppSession();

test("opens on the empty library", async () => {
  const heading = await appSession().waitFor(PAGE_HEADING);

  expect(await heading.text()).toBe("Library");
});

test("opens on the library again once the first launch is finished", async () => {
  await appSession().reload();

  const heading = await appSession().waitFor(PAGE_HEADING);

  expect(await heading.text()).toBe("Library");
});

test("shows the version the Rust core reports in Settings › About", async () => {
  await (await appSession().waitFor(SETTINGS_LINK)).click();
  await (await appSession().waitFor(ABOUT_LINK)).click();

  const version = await appSession().waitFor(VERSION);

  expect(await version.text()).toMatch(/^(Version )?\d+\.\d+\.\d+$/);
});
