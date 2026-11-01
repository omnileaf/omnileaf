import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { MissingFolder } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import MissingFolderToast from "./MissingFolderToast.svelte";

const MISSING = {
  folder: {
    id: "5a4d1e00-0000-4000-8002-000000000002",
    kind: "linked",
    name: "Comics",
    location: "/media/Comics",
    isAvailable: false,
  },
  problem: { kind: "missing" },
  hiddenSeries: 41,
  isShownAnyway: false,
} as MissingFolder;

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function toastOnWindows() {
  document.documentElement.dataset.theme = "light";
  followCorePlatform("windows");
  await page.viewport(1280, 800);
  await render(MissingFolderToast, {
    props: {
      missing: MISSING,
      isStillFailing: false,
      toast: { dismiss: () => undefined, lapse: () => undefined },
      handlers: {
        showAnyway: () => undefined,
        find: () => undefined,
        unlink: () => undefined,
        signIn: () => undefined,
        tryAgain: () => undefined,
      },
    },
  });
}

test("draws both of the warning's actions as standard buttons on Windows", async () => {
  await toastOnWindows();

  for (const name of ["Show them anyway", "Find the folder"]) {
    const style = getComputedStyle(
      page.getByRole("button", { name }).element(),
    );

    expect([style.height, style.backgroundColor]).toEqual([
      "32px",
      resolvedColour("--native-color-button-secondary", "backgroundColor"),
    ]);
  }
});
