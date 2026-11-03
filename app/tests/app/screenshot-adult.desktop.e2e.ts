import { expect, test } from "vitest";

import { addSampleLibrary, useAppSession } from "./app-session.ts";

const FILTER = `{ adult: "any", bookmarked: "any", finished: "any", formats: [], languages: [], smart: [], started: "any", tags: [], unread: "any" }`;
const INVOKE = "window.__TAURI_INTERNALS__.invoke";
const MARKED_TITLE = "Sample Series 02";

const SERIES_TITLES = `return ${INVOKE}("library_series", { after: null, listing: { filter: ${FILTER}, sort: { by: "title", direction: "ascending" } } }).then((page) => page.series.map((series) => series.title).join("|"));`;

const MARK_ADULT = `return ${INVOKE}("library_series", { after: null, listing: { filter: ${FILTER}, sort: { by: "title", direction: "ascending" } } }).then((page) => ${INVOKE}("edit_series_details", { series: page.series.find((series) => series.title === ${JSON.stringify(MARKED_TITLE)}).id, edits: { title: null, people: null, tags: null, summary: null, isMarkedAdult: true } })).then(() => true);`;

const SCREENSHOT_MODE = (on: boolean): string =>
  `return ${INVOKE}("set_screenshot_mode", { on: ${String(on)} }).then(() => true);`;

const FOUND_TITLES = `return ${INVOKE}("library_search", { after: null, search: { text: "Sample", filter: ${FILTER} } }).then((page) => page.series.map((series) => series.title).join("|"));`;

const SERIES_COUNT = `return ${INVOKE}("library_series_count", { filter: ${FILTER} });`;

const appSession = useAppSession();

function answer(script: string): Promise<unknown> {
  return appSession().run(script);
}

test("leaves a series marked 18+ out of the library, search and counts while Screenshot mode is on, and brings it back when it is off", async () => {
  await addSampleLibrary(appSession());
  await answer(MARK_ADULT);
  expect(await answer(SERIES_COUNT)).toBe(3);

  await answer(SCREENSHOT_MODE(true));

  expect(await answer(SERIES_COUNT)).toBe(2);
  expect(await answer(SERIES_TITLES)).not.toContain(MARKED_TITLE);
  expect(await answer(FOUND_TITLES)).not.toContain(MARKED_TITLE);
  expect(await answer(FOUND_TITLES)).toContain("Sample Series 01");

  await answer(SCREENSHOT_MODE(false));

  expect(await answer(SERIES_COUNT)).toBe(3);
  expect(await answer(FOUND_TITLES)).toContain(MARKED_TITLE);
});
