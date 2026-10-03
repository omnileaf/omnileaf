import { expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { xpath } from "./webdriver.ts";

const SETTINGS_LINK = xpath("//nav//a[normalize-space()='Settings']");
const ABOUT_LINK = xpath("//main//a[starts-with(normalize-space(), 'About')]");
const COPY_BUTTON = xpath("//button[normalize-space()='Copy version details']");
const COPY_OUTCOME = xpath(
  "//button[normalize-space()='Copied'] | //*[@role='alert'][normalize-space()]",
);
const LICENCES_LINK = xpath(
  "//main//a[starts-with(normalize-space(), 'Open-source licences')]",
);
const FIRST_LICENCE_GROUP = xpath("(//main//section//h2)[1]");

const appSession = useAppSession();

async function openAbout(): Promise<void> {
  await (await appSession().waitFor(SETTINGS_LINK)).click();
  await (await appSession().waitFor(ABOUT_LINK)).click();
}

test("confirms the version details were copied", async () => {
  await openAbout();

  await (await appSession().waitFor(COPY_BUTTON)).click();

  const outcome = await appSession().waitFor(COPY_OUTCOME);
  expect(await outcome.text()).toBe("Copied");
});

test("lists the licences of the packages it ships", async () => {
  await openAbout();
  await (await appSession().waitFor(LICENCES_LINK)).click();

  const group = await appSession().waitFor(FIRST_LICENCE_GROUP);

  expect(await group.text()).toMatch(/\S/);
});
