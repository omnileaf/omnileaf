import { expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { SAMPLE_LIBRARY } from "./sample-library.ts";
import { xpath } from "./webdriver.ts";

const ADD_FOLDER_BUTTON = xpath("//button[normalize-space()='Add a folder']");
const FOLDER_REPORT = xpath("//*[@role='status'][normalize-space()]");

const appSession = useAppSession();

test("adds a folder and reports the comics in it", async () => {
  const button = await appSession().waitFor(ADD_FOLDER_BUTTON);

  await button.click();

  const report = await appSession().waitFor(FOLDER_REPORT);
  expect(await report.text()).toBe(
    `Found ${String(SAMPLE_LIBRARY.comics.length)} comics in ${SAMPLE_LIBRARY.name}.`,
  );
});
