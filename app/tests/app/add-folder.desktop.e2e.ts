import { expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { SAMPLE_LIBRARY } from "./sample-library.ts";
import { xpath } from "./webdriver.ts";

const ADD_FOLDER_BUTTON = xpath("//button[normalize-space()='Add a folder']");
const FOLDER_REPORT = xpath("//*[@role='status'][normalize-space()]");
const SETTINGS_LINK = xpath("//nav//a[normalize-space()='Settings']");
const LIBRARY_SETTINGS_LINK = xpath("//main//a[normalize-space()='Library']");
const LINKED_FOLDER_NAMES = xpath(
  "//section[h2[normalize-space()='Folders']]//li//p[1]",
);

const appSession = useAppSession();

test("adds a folder and reports the comics in it", async () => {
  const button = await appSession().waitFor(ADD_FOLDER_BUTTON);

  await button.click();

  const report = await appSession().waitFor(FOLDER_REPORT);
  expect(await report.text()).toBe(
    `Found ${String(SAMPLE_LIBRARY.comics.length)} comics in ${SAMPLE_LIBRARY.name}.`,
  );
});

test("adds a folder from Settings › Library and lists it there", async () => {
  await (await appSession().waitFor(SETTINGS_LINK)).click();
  await (await appSession().waitFor(LIBRARY_SETTINGS_LINK)).click();
  const button = await appSession().waitFor(ADD_FOLDER_BUTTON);

  await button.click();

  const report = await appSession().waitFor(FOLDER_REPORT);
  expect(await report.text()).toBe(
    `Found ${String(SAMPLE_LIBRARY.comics.length)} comics in ${SAMPLE_LIBRARY.name}.`,
  );
  const listed = await appSession().waitFor(LINKED_FOLDER_NAMES);
  expect(await listed.text()).toBe(SAMPLE_LIBRARY.name);
});
