import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { LinkOpening } from "#lib/about/link-opening.svelte.ts";
import type { ProjectLink } from "#lib/ipc/bindings.ts";

import LibraryProblemScreen from "./LibraryProblemScreen.svelte";

const OPENED = { status: "ok", data: null } as const;
const BROWSER_UNAVAILABLE = {
  status: "error",
  error: {
    code: "browserUnavailable",
    message: "the browser could not be opened",
  },
} as const;

function openingThatRecords(): {
  readonly opening: LinkOpening;
  readonly opened: ProjectLink[];
} {
  const opened: ProjectLink[] = [];
  const opening = new LinkOpening((link) => {
    opened.push(link);
    return Promise.resolve(OPENED);
  });
  return { opening, opened };
}

test("says a newer Omnileaf wrote the library and offers the latest release", async () => {
  const { opening, opened } = openingThatRecords();
  const screen = await render(LibraryProblemScreen, {
    problem: "writtenByANewerVersion",
    opening,
  });

  await screen.getByRole("button", { name: "Get the latest Omnileaf" }).click();

  await expect
    .element(
      screen.getByRole("heading", {
        level: 1,
        name: "This library is from a newer Omnileaf",
      }),
    )
    .toBeVisible();
  await expect.poll(() => opened).toEqual(["latestRelease"]);
});

test("says the library couldn't be opened and offers to report it", async () => {
  const { opening, opened } = openingThatRecords();
  const screen = await render(LibraryProblemScreen, {
    problem: "couldNotOpen",
    opening,
  });

  await screen.getByRole("button", { name: "Report a problem" }).click();

  await expect
    .element(
      screen.getByRole("heading", {
        level: 1,
        name: "Your library couldn't be opened",
      }),
    )
    .toBeVisible();
  await expect.poll(() => opened).toEqual(["newIssue"]);
});

test("says when the browser couldn't be opened", async () => {
  const opening = new LinkOpening(() => Promise.resolve(BROWSER_UNAVAILABLE));
  const screen = await render(LibraryProblemScreen, {
    problem: "writtenByANewerVersion",
    opening,
  });

  await screen.getByRole("button", { name: "Get the latest Omnileaf" }).click();

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Couldn't open your browser. Try again.");
});
