import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import { CrashReportSetting } from "./choice.svelte";
import CrashReportPrompt from "./CrashReportPrompt.svelte";
import {
  type CrashReportBackend,
  CrashReporting,
} from "./crash-reporting.svelte";

const DESKTOP = { width: 1280, height: 800 } as const;
const DETAILS = "Omnileaf 1.2.3 on Windows\nPanic: boom\n";
const OK = { status: "ok", data: null } as const;

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

async function promptOn(
  platform: "windows" | "macos",
  theme: "light" | "dark" = "light",
) {
  await page.viewport(DESKTOP.width, DESKTOP.height);
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
  const backend: CrashReportBackend = {
    offerSavedCrashReport: () =>
      Promise.resolve({
        status: "ok",
        data: { details: DETAILS, origin: "panic" },
      }),
    offerInterfaceErrorReport: () => Promise.resolve(OK),
    sendCrashReport: () => Promise.resolve(OK),
    copyCrashReport: () => Promise.resolve(OK),
    declineCrashReport: () => Promise.resolve(OK),
  } as unknown as CrashReportBackend;
  const reporting = new CrashReporting(
    backend,
    new CrashReportSetting({ getItem: () => "ask", setItem: () => undefined }),
  );
  await reporting.offerSaved();
  await render(CrashReportPrompt, {
    props: { reporting, look: "dialog" },
  });
  return page.getByRole("alertdialog");
}

function buttonsOf(dialog: ReturnType<typeof page.getByRole>) {
  return [...dialog.element().querySelectorAll("button")]
    .filter((button) => button.textContent.trim() !== "")
    .map((button) => ({
      name: button.textContent.trim(),
      height: getComputedStyle(button).height,
    }));
}

test("draws the prompt as a 448px content dialog with 8px corners and no title badge on Windows", async () => {
  const dialog = await promptOn("windows");

  const style = getComputedStyle(dialog.element());
  const badge = dialog.element().querySelector("[data-prompt-badge]");

  expect(style.width).toBe("448px");
  expect(style.borderTopLeftRadius).toBe("8px");
  expect(getComputedStyle(badge ?? document.body).display).toBe("none");
});

test("sets the title as a Subtitle and the body as Body on Windows", async () => {
  const dialog = await promptOn("windows");

  const title = dialog.getByRole("heading").element();
  const body = dialog.getByText("Nothing was lost", { exact: false }).element();

  expect([
    getComputedStyle(title).fontSize,
    getComputedStyle(title).fontWeight,
    getComputedStyle(body).fontSize,
  ]).toEqual(["20px", "600", "14px"]);
});

test("leads the button band with sending, then copying, and ends it with not sending on Windows", async () => {
  const dialog = await promptOn("windows");

  expect(buttonsOf(dialog)).toEqual([
    { name: "Send report", height: "32px" },
    { name: "Copy details", height: "32px" },
    { name: "Don't send", height: "32px" },
  ]);
});

test("fills sending with the accent and sets the band under a 1px rule on Windows", async () => {
  const dialog = await promptOn("windows");

  const send = dialog.getByRole("button", { name: "Send report" }).element();
  const band = send.parentElement;

  expect(getComputedStyle(send).backgroundColor).toBe(
    resolvedColour("--native-color-button-primary", "backgroundColor"),
  );
  expect(getComputedStyle(band ?? send).borderTopWidth).toBe("1px");
});

test("keeps the prompt's own button order on macOS", async () => {
  const dialog = await promptOn("macos");

  expect(buttonsOf(dialog).map(({ name }) => name)).toEqual([
    "Copy details",
    "Don't send",
    "Send report",
  ]);
});
