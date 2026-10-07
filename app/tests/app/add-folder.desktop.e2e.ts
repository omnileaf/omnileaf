import { expect, test } from "vitest";

import {
  mainNavigationLink,
  openLibraryPage,
  useAppSession,
} from "./app-session.ts";
import { SAMPLE_LIBRARY } from "./sample-library.ts";
import { xpath } from "./webdriver.ts";

const ADD_FOLDER_BUTTON = xpath("//button[normalize-space()='Add a folder']");
const FINISHED_SCAN_REPORT = xpath(
  "//*[@role='status'][starts-with(normalize-space(), 'Found ')]",
);
const SETTINGS_LINK = mainNavigationLink("Settings");
const LIBRARY_SETTINGS_LINK = xpath("//main//a[normalize-space()='Library']");
const LINKED_FOLDER_NAMES = xpath(
  "//section[.//h2[normalize-space()='Folders']]//li//p[1]",
);
const REMOVE_SAMPLE_LIBRARY = xpath(
  `//button[@aria-label='Remove ${SAMPLE_LIBRARY.name}']`,
);
const CONFIRM_REMOVAL = xpath(
  `//dialog[@open]//button[normalize-space()='Remove ${SAMPLE_LIBRARY.name}']`,
);
const FOLDERS_WITHOUT_LINKED_FOLDERS = xpath(
  "//section[.//h2[normalize-space()='Folders']][not(.//li)]",
);
const FOLDERS_SECTION = xpath("//section[.//h2[normalize-space()='Folders']]");
const RESCAN_SAMPLE_LIBRARY = xpath(
  `//button[@aria-label='Rescan ${SAMPLE_LIBRARY.name}']`,
);
const UP_TO_DATE_REPORT = xpath(
  `//*[@role='status']/p[normalize-space()='${SAMPLE_LIBRARY.name} is up to date.']`,
);
const LOADED_HOME_FOLDER = xpath(
  "//section[.//h2[normalize-space()='Home folder']]//p[normalize-space()='Omnileaf']",
);

const LIBRARY_LINK = xpath("//nav//a[normalize-space()='Library']");
const VIEW_OPTIONS_BUTTON = xpath("//button[@aria-label='View options']");
const LIBRARY_ADD_FOLDER_BUTTON = xpath(
  "//main[.//button[@aria-label='View options']]//button[normalize-space()='Add a folder']",
);
const LIST_CHOICE = xpath("//dialog[@open]//label[normalize-space()='List']");
const SERIES_IN_ONE_COLUMN = `const series = document.querySelector("ul[aria-label='Series']");
return series !== null && series.children.length > 0 && getComputedStyle(series).gridTemplateColumns.split(" ").length === 1;`;

const EVERY_COVER_SHOWN = `const covers = [...document.querySelectorAll("ul[aria-label='Series'] img")];
return covers.length === ${String(SAMPLE_LIBRARY.series)} && covers.every((cover) => cover.complete && cover.naturalWidth > 0);`;

const SCAN_REPORT = `Found ${String(SAMPLE_LIBRARY.books)} books in ${String(SAMPLE_LIBRARY.series)} series in ${SAMPLE_LIBRARY.name}.`;

const appSession = useAppSession();

/** Leaves for the library page first, so re-opening Library settings can't find the page it is replacing. */
async function openLibrarySettings(): Promise<void> {
  await openLibraryPage(appSession());
  await (await appSession().waitFor(SETTINGS_LINK)).click();
  await (await appSession().waitFor(LIBRARY_SETTINGS_LINK)).click();
}

test("adds a folder, waits for its scan and reports the series and books in it", async () => {
  const button = await appSession().waitFor(ADD_FOLDER_BUTTON);

  await button.click();

  const report = await appSession().waitFor(FINISHED_SCAN_REPORT);
  expect(await report.text()).toBe(SCAN_REPORT);
});

test("shows the cover of every series it found, read through the app's own protocol", async () => {
  await (await appSession().waitFor(ADD_FOLDER_BUTTON)).click();
  await appSession().waitFor(FINISHED_SCAN_REPORT);

  const shown = appSession().waitUntil(
    EVERY_COVER_SHOWN,
    "a loaded cover for every series",
  );

  await expect(shown).resolves.toBeUndefined();
});

test("adds a folder from Settings › Library and lists it there", async () => {
  await openLibrarySettings();
  const button = await appSession().waitFor(ADD_FOLDER_BUTTON);

  await button.click();

  const report = await appSession().waitFor(FINISHED_SCAN_REPORT);
  expect(await report.text()).toBe(SCAN_REPORT);
  const listed = await appSession().waitFor(LINKED_FOLDER_NAMES);
  expect(await listed.text()).toBe(SAMPLE_LIBRARY.name);
});

test("removes a folder from Settings › Library once the removal is confirmed", async () => {
  await openLibrarySettings();
  await (await appSession().waitFor(ADD_FOLDER_BUTTON)).click();
  await (await appSession().waitFor(REMOVE_SAMPLE_LIBRARY)).click();

  await (await appSession().waitFor(CONFIRM_REMOVAL)).click();

  await appSession().waitFor(FOLDERS_WITHOUT_LINKED_FOLDERS);
  await openLibrarySettings();
  await appSession().waitFor(LOADED_HOME_FOLDER);
  const folders = await appSession().waitFor(FOLDERS_SECTION);
  expect(await folders.text()).not.toContain(SAMPLE_LIBRARY.name);
});

test("rescans a folder from Settings › Library and finds nothing changed", async () => {
  await openLibrarySettings();
  await (await appSession().waitFor(ADD_FOLDER_BUTTON)).click();
  await appSession().waitFor(FINISHED_SCAN_REPORT);

  await (await appSession().waitFor(RESCAN_SAMPLE_LIBRARY)).click();

  const report = await appSession().waitFor(UP_TO_DATE_REPORT);
  expect(await report.text()).toBe(`${SAMPLE_LIBRARY.name} is up to date.`);
});

test("draws the library as the list chosen in its view options after the app reloads", async () => {
  await (await appSession().waitFor(LIBRARY_LINK)).click();
  await (await appSession().waitFor(LIBRARY_ADD_FOLDER_BUTTON)).click();
  await appSession().waitFor(FINISHED_SCAN_REPORT);
  await (await appSession().waitFor(VIEW_OPTIONS_BUTTON)).click();
  await (await appSession().waitFor(LIST_CHOICE)).click();
  await appSession().waitUntil(SERIES_IN_ONE_COLUMN, "the series in a list");

  await appSession().reload();

  const listed = appSession().waitUntil(
    SERIES_IN_ONE_COLUMN,
    "the series in a list once the app reloaded",
  );
  await expect(listed).resolves.toBeUndefined();
});
