import { expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { isRecord } from "./json.ts";
import { xpath } from "./webdriver.ts";

const LIBRARY_MORE_BUTTON = xpath(
  "//button[@aria-label='More for the library']",
);
const LIBRARY_MORE_CENTRE = `const { x, y, width, height } = document.querySelector("button[aria-label='More for the library']").getBoundingClientRect();
return { x: x + width / 2, y: y + height / 2 };`;
const VIEW_OPTIONS_ITEM = xpath(
  "//*[@role='menuitem'][normalize-space()='View options']",
);
const OPEN_SHEET = xpath(
  "//*[@aria-modal='true'][@data-state='open']//h2[normalize-space()='View options']",
);
const CHOOSE_COVERS = xpath(
  "//*[@aria-modal='true'][@data-state='open']//*[@role='radio'][.//span[normalize-space()='Choose']]",
);
const DONE = xpath(
  "//*[@aria-modal='true'][@data-state='open']//button[normalize-space()='Done']",
);
const FEWER = "Fewer covers per row";
const MORE = "More covers per row";
const SHEET_CONTENT_HEIGHT = `return document.querySelector("[aria-modal=true][data-state=open]").scrollHeight;`;
const COVERS_PER_ROW = `document.querySelector("[aria-modal=true][data-state=open] output").textContent.trim()`;
const CAN_SHOW_FEWER = `return !document.querySelector("[aria-modal=true][data-state=open] button[aria-label='${FEWER}']").disabled;`;

const appSession = useAppSession();

/** Taps More with a finger on the screen, since the menu opens only on a touch pointerup and a WebDriver click in the web view sends none. */
async function openLibraryMore(): Promise<void> {
  await appSession().waitFor(LIBRARY_MORE_BUTTON);
  const centre = await appSession().run(LIBRARY_MORE_CENTRE);
  if (!isRecord(centre)) {
    throw new Error("expected the centre of More as a point");
  }
  await appSession().runMobileCommand("tap", centre);
}

async function stepCoversPerRow(label: string): Promise<void> {
  const before = await appSession().run(`return ${COVERS_PER_ROW};`);
  const step = xpath(
    `//*[@aria-modal='true'][@data-state='open']//button[@aria-label='${label}'][not(@disabled)]`,
  );

  await (await appSession().waitFor(step)).click();

  await appSession().waitUntil(
    `return ${COVERS_PER_ROW} !== ${JSON.stringify(before)};`,
    `covers per row to change from ${String(before)}`,
  );
}

test("opens View options at the height it keeps once something in it changes", async () => {
  await openLibraryMore();
  await (await appSession().waitFor(VIEW_OPTIONS_ITEM)).click();
  await appSession().waitFor(OPEN_SHEET);
  await (await appSession().waitFor(CHOOSE_COVERS)).click();
  await appSession().waitUntil(
    `return document.querySelector("[aria-modal=true][data-state=open] button[aria-label='${FEWER}']") !== null;`,
    "the covers per row steppers",
  );
  const opened = await appSession().run(SHEET_CONTENT_HEIGHT);
  const [away, back] =
    (await appSession().run(CAN_SHOW_FEWER)) === true
      ? [FEWER, MORE]
      : [MORE, FEWER];

  await stepCoversPerRow(away);
  await stepCoversPerRow(back);

  expect(await appSession().run(SHEET_CONTENT_HEIGHT)).toBe(opened);
  await (await appSession().waitFor(DONE)).click();
});
