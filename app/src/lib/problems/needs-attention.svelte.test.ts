import { expect, test } from "vitest";

import type { IpcError, MissingFolder } from "#lib/ipc/bindings.ts";

import { NeedsAttention } from "./needs-attention.svelte";

const COMICS = {
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

const UNREADABLE: IpcError = {
  code: "internal",
  message: "the library couldn't be read",
};

function gathering(missing: MissingFolder[]): NeedsAttention {
  return new NeedsAttention(
    { missingFolders: () => Promise.resolve({ status: "ok", data: missing }) },
    () => undefined,
  );
}

test("needs nothing until it has gathered", () => {
  const attention = gathering([COMICS]);

  expect(attention.problems).toEqual([]);
});

test("lists each missing folder as a problem", async () => {
  const attention = gathering([COMICS]);

  await attention.gather();

  expect(attention.problems).toEqual([
    { kind: "missingFolder", missing: COMICS },
  ]);
});

test("lists a missing folder whose series are shown anyway, since it's still missing", async () => {
  const shown = { ...COMICS, isShownAnyway: true };
  const attention = gathering([shown]);

  await attention.gather();

  expect(attention.problems).toEqual([
    { kind: "missingFolder", missing: shown },
  ]);
});

test("lets a problem go once gathering no longer finds it", async () => {
  let missing = [COMICS];
  const attention = new NeedsAttention(
    { missingFolders: () => Promise.resolve({ status: "ok", data: missing }) },
    () => undefined,
  );
  await attention.gather();

  missing = [];
  await attention.gather();

  expect(attention.problems).toEqual([]);
});

test("keeps what it had and reports the error when the folders can't be read", async () => {
  let fails = false;
  const reported: IpcError[] = [];
  const attention = new NeedsAttention(
    {
      missingFolders: () =>
        Promise.resolve(
          fails
            ? { status: "error", error: UNREADABLE }
            : { status: "ok", data: [COMICS] },
        ),
    },
    (error) => {
      reported.push(error);
    },
  );
  await attention.gather();

  fails = true;
  await attention.gather();

  expect([attention.problems, reported]).toEqual([
    [{ kind: "missingFolder", missing: COMICS }],
    [UNREADABLE],
  ]);
});

test("starts with its sheet closed, opens it on asking and closes it again", () => {
  const attention = gathering([COMICS]);

  const shown = [attention.isShown];
  attention.show();
  shown.push(attention.isShown);
  attention.hide();
  shown.push(attention.isShown);

  expect(shown).toEqual([false, true, false]);
});
