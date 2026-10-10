import { expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { xpath } from "./webdriver.ts";

const VIEW_OPTIONS_BUTTON = xpath("//button[@aria-label='View options']");
const OPEN_SHEET = xpath("//dialog[@open]//h2[normalize-space()='View']");
const DONE = xpath("//dialog[@open]//button[normalize-space()='Done']");
const FEWER = "Fewer covers per row";
const MORE = "More covers per row";
const SHEET_CONTENT_HEIGHT = `return document.querySelector("dialog[open]").scrollHeight;`;
const COVERS_PER_ROW = `document.querySelector("dialog[open] output").textContent.trim()`;
const CAN_SHOW_FEWER = `return !document.querySelector("dialog[open] button[aria-label='${FEWER}']").disabled;`;

const appSession = useAppSession();

async function stepCoversPerRow(label: string): Promise<void> {
  const before = await appSession().run(`return ${COVERS_PER_ROW};`);
  const step = xpath(
    `//dialog[@open]//button[@aria-label='${label}'][not(@disabled)]`,
  );

  await (await appSession().waitFor(step)).click();

  await appSession().waitUntil(
    `return ${COVERS_PER_ROW} !== ${JSON.stringify(before)};`,
    `covers per row to change from ${String(before)}`,
  );
}

test("opens View options at the height it keeps once something in it changes", async () => {
  await (await appSession().waitFor(VIEW_OPTIONS_BUTTON)).click();
  await appSession().waitFor(OPEN_SHEET);
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
