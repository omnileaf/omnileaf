import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { dropTargetAt } from "./drop-target-at.ts";
import FileDropOverlay from "./FileDropOverlay.svelte";
import type { DropState } from "./file-drop.svelte.ts";

function boxOf(selector: string): DOMRect {
  const target = document.querySelector(selector);
  if (target === null) {
    throw new Error(`nothing matches ${selector}`);
  }
  return target.getBoundingClientRect();
}

const shownName = (name: string): string => name;

afterEach(() => {
  document.documentElement.removeAttribute("data-platform");
});

const OFFERING: DropState = {
  kind: "offering",
  summary: { first: "One.cbz", more: 2, totalKilobytes: 45_000, refused: [] },
  over: null,
  copies: false,
};

test("names the first file, how many more there are and their size", async () => {
  await render(FileDropOverlay, { state: OFFERING, shownName });

  await expect
    .element(page.getByText("One.cbz and 2 more · 45 MB"))
    .toBeVisible();
});

test("offers reading now and adding to the library", async () => {
  await render(FileDropOverlay, { state: OFFERING, shownName });

  await expect.element(page.getByText("Read now")).toBeVisible();
  await expect
    .element(page.getByText("Opens One.cbz without adding anything."))
    .toBeVisible();
  await expect.element(page.getByText("Add to your library")).toBeVisible();
  await expect
    .element(
      page.getByText("Links their folder; the files stay where they are."),
    )
    .toBeVisible();
});

test("says the files are copied in the adding target while Alt is held", async () => {
  await render(FileDropOverlay, {
    state: { ...OFFERING, copies: true },
    shownName,
  });

  await expect
    .element(page.getByText("Copies them into your home folder instead."))
    .toBeVisible();
  await expect
    .element(
      page.getByText("Links their folder; the files stay where they are."),
    )
    .not.toBeInTheDocument();
});

test("tells the person that holding Alt copies", async () => {
  await render(FileDropOverlay, { state: OFFERING, shownName });

  await expect.element(page.getByText("Alt", { exact: true })).toBeVisible();
  await expect
    .element(page.getByText(/to copy them into your home folder instead\./u))
    .toBeVisible();
});

test("marks the target under the pointer", async () => {
  await render(FileDropOverlay, {
    state: { ...OFFERING, over: "readNow" },
    shownName,
  });

  const over = [...document.querySelectorAll<HTMLElement>("[data-over=true]")];

  expect(over.map((target) => target.dataset["dropTarget"])).toEqual([
    "readNow",
  ]);
});

test("lets each target be found at its own place on the page", async () => {
  await render(FileDropOverlay, { state: OFFERING, shownName });

  const reading = boxOf('[data-drop-target="readNow"]');
  const adding = boxOf('[data-drop-target="add"]');

  expect(
    dropTargetAt(reading.x + reading.width / 2, reading.y + reading.height / 2),
  ).toBe("readNow");
  expect(
    dropTargetAt(adding.x + adding.width / 2, adding.y + adding.height / 2),
  ).toBe("add");
});

test("explains why nothing was added instead of offering the targets", async () => {
  await render(FileDropOverlay, {
    state: {
      kind: "refused",
      refused: [
        { name: "notes.pdf", reason: "notAComic" },
        { name: "Volume 6.cbr", reason: "typeNotReadYet" },
      ],
    },
    shownName,
  });

  await expect.element(page.getByText("Nothing added")).toBeVisible();
  await expect
    .element(page.getByText("notes.pdf isn't a comic or book Omnileaf reads."))
    .toBeVisible();
  await expect
    .element(
      page.getByText(
        "Volume 6.cbr is a comic type this version can't read yet.",
      ),
    )
    .toBeVisible();
  expect(document.querySelector("[data-drop-target]")).toBeNull();
});

test("shows nothing while no drag is over the window", async () => {
  await render(FileDropOverlay, { state: { kind: "idle" }, shownName });

  expect(document.querySelector("[data-slot=drop-layer]")).toBeNull();
});

test("shows every name under the name given for it", async () => {
  await render(FileDropOverlay, {
    state: OFFERING,
    shownName: () => "Folder 07",
  });

  await expect
    .element(page.getByText("Folder 07 and 2 more · 45 MB"))
    .toBeVisible();
  await expect
    .element(page.getByText("Opens Folder 07 without adding anything."))
    .toBeVisible();
});

test("announces the offer and the refusal as status messages", async () => {
  const { unmount } = await render(FileDropOverlay, {
    state: OFFERING,
    shownName,
  });
  await expect
    .element(page.getByRole("status", { name: "Drop files" }))
    .toBeVisible();
  await unmount();

  await render(FileDropOverlay, {
    state: {
      kind: "refused",
      refused: [{ name: "a.pdf", reason: "notAComic" }],
    },
    shownName,
  });

  await expect
    .element(page.getByRole("status", { name: "Drop files" }))
    .toBeVisible();
});
