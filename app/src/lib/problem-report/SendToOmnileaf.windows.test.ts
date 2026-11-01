import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import { ReportSharing, type ShareBackend } from "./report-sharing.svelte";
import SendToOmnileaf from "./SendToOmnileaf.svelte";

const unused = () => Promise.reject(new Error("not this way"));
const BACKEND: ShareBackend = {
  sendProblemReport: unused,
  copyProblemReport: unused,
  openProblemReportIssue: unused,
  saveProblemReport: unused,
};

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

async function formOn(
  platform: "windows" | "macos",
  theme: "light" | "dark" = "light",
) {
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
  const sharing = new ReportSharing(
    BACKEND,
    () => 20_742,
    () => undefined,
  );
  const screen = await render(SendToOmnileaf, { sharing });
  return {
    field: screen.getByRole("textbox").element(),
    send: screen.getByRole("button", { name: /^Send/ }).element(),
  };
}

test("draws the send button as the 32px accent button on Windows", async () => {
  const { send } = await formOn("windows");

  const style = getComputedStyle(send);

  expect(style.height).toBe("32px");
  expect(style.borderTopLeftRadius).toBe("4px");
  expect(style.backgroundColor).toBe(
    resolvedColour("--native-color-button-primary", "backgroundColor"),
  );
});

test("draws the reply field as a 32px TextBox with a 1px stroke on Windows", async () => {
  const { field } = await formOn("windows");

  const style = getComputedStyle(field);

  expect(style.height).toBe("32px");
  expect(style.borderTopLeftRadius).toBe("4px");
  expect([
    style.borderTopWidth,
    style.borderLeftWidth,
    style.borderBottomWidth,
  ]).toEqual(["1px", "1px", "1px"]);
  expect(style.boxShadow).toBe("none");
});

test("turns the field's bottom edge into a 2px accent line when it has focus on Windows", async () => {
  const { field } = await formOn("windows");

  field.focus();
  const style = getComputedStyle(field);

  expect(style.borderBottomWidth).toBe("2px");
  expect(style.borderBottomColor).toBe(
    resolvedColour("--native-color-button-primary", "color"),
  );
  expect(style.borderTopWidth).toBe("1px");
});

test("keeps the large button and raised field on macOS", async () => {
  const { field, send } = await formOn("macos");

  expect(getComputedStyle(send).backgroundColor).not.toBe(
    resolvedColour("--native-color-button-primary", "backgroundColor"),
  );
  expect(getComputedStyle(field).boxShadow).not.toBe("none");
});
