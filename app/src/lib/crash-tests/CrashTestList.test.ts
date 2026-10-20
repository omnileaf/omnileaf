import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import type { CrashTests } from "./crash-tests";
import CrashTestList from "./CrashTestList.svelte";

type CrashTestName = "panicInCore" | "throwInterfaceError" | "crashAndQuit";

function fakeTests() {
  const ran: CrashTestName[] = [];
  const tests: Pick<CrashTests, CrashTestName> = {
    panicInCore: () => {
      ran.push("panicInCore");
      return Promise.resolve();
    },
    throwInterfaceError: () => {
      ran.push("throwInterfaceError");
    },
    crashAndQuit: () => {
      ran.push("crashAndQuit");
      return Promise.resolve();
    },
  };
  return { tests, ran };
}

async function renderList() {
  const { tests, ran } = fakeTests();
  const screen = await render(CrashTestList, { tests, version: "1.2.3" });
  return {
    screen,
    ran,
    dialog: screen.getByRole("alertdialog"),
    crashTest: (title: string) =>
      screen.getByRole("button", { name: new RegExp(`^${title} `, "u") }),
  };
}

test("groups the crash tests under Crash reports", async () => {
  const { screen } = await renderList();

  const group = screen.getByRole("region", { name: "Crash reports" });

  expect(group.getByRole("listitem").elements()).toHaveLength(3);
});

test("names each crash test by its title and the line under it", async () => {
  const { screen } = await renderList();

  const crashTests = screen
    .getByRole("region", { name: "Crash reports" })
    .getByRole("button");

  await expect
    .element(crashTests.nth(0))
    .toHaveAccessibleName(
      "Panic in the core Panics on a background thread, then offers the report the way the next launch would.",
    );
  await expect
    .element(crashTests.nth(1))
    .toHaveAccessibleName(
      "Throw an interface error Throws an error the interface doesn't handle; its report is offered straight away.",
    );
  await expect
    .element(crashTests.nth(2))
    .toHaveAccessibleName(
      "Crash and quit Panics and quits. Open Omnileaf again to see the report it kept.",
    );
});

test("panics in the core straight away", async () => {
  const { crashTest, ran, dialog } = await renderList();

  await crashTest("Panic in the core").click();

  expect(ran).toEqual(["panicInCore"]);
  await expect.element(dialog).not.toBeInTheDocument();
});

test("throws an interface error straight away", async () => {
  const { crashTest, ran, dialog } = await renderList();

  await crashTest("Throw an interface error").click();

  expect(ran).toEqual(["throwInterfaceError"]);
  await expect.element(dialog).not.toBeInTheDocument();
});

test("asks before crashing and quitting", async () => {
  const { crashTest, ran, dialog } = await renderList();

  await crashTest("Crash and quit").click();

  await expect.element(dialog).toHaveAccessibleName("Crash Omnileaf now?");
  await expect
    .element(dialog)
    .toHaveAccessibleDescription(
      "Omnileaf 1.2.3 · Development build It quits straight away. Open it again to see the crash report it kept.",
    );
  expect(ran).toEqual([]);
});

test("starts the crash question on Cancel", async () => {
  const { crashTest, dialog } = await renderList();

  await crashTest("Crash and quit").click();

  await expect
    .element(dialog.getByRole("button", { name: "Cancel" }))
    .toHaveFocus();
});

test("crashes and quits once the crash is confirmed", async () => {
  const { crashTest, ran, dialog } = await renderList();
  await crashTest("Crash and quit").click();

  await dialog.getByRole("button", { name: "Crash and quit" }).click();

  expect(ran).toEqual(["crashAndQuit"]);
  await expect.element(dialog).not.toBeInTheDocument();
});

test("keeps running when the crash is cancelled", async () => {
  const { crashTest, ran, dialog } = await renderList();
  await crashTest("Crash and quit").click();

  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect.element(dialog).not.toBeInTheDocument();
  expect(ran).toEqual([]);
});

test("keeps running when the crash question is dismissed with Escape", async () => {
  const { crashTest, ran, dialog } = await renderList();
  await crashTest("Crash and quit").click();
  await expect.element(dialog).toBeVisible();

  await userEvent.keyboard("{Escape}");

  await expect.element(dialog).not.toBeInTheDocument();
  expect(ran).toEqual([]);
});

test("points to the crash report choice in Privacy and security", async () => {
  const { screen } = await renderList();

  const footnote = screen.getByText(/^Reports follow your choice in/);

  await expect
    .element(footnote)
    .toHaveTextContent("Reports follow your choice in Privacy and security.");
  await expect
    .element(footnote.getByRole("link", { name: "Privacy and security" }))
    .toHaveAttribute("href", "/settings/privacy");
});
