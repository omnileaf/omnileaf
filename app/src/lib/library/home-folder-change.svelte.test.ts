import { expect, test } from "vitest";

import type {
  ChosenHomeFolder,
  FoundLibrary,
  HomeChoice,
  IpcErrorCode,
} from "#lib/ipc/bindings.ts";
import { type Notice, Notices } from "#lib/notices/notices.ts";
import { m } from "#lib/paraglide/messages.js";

import {
  type HomeCommands,
  HomeFolderChange,
} from "./home-folder-change.svelte";

const CHOSEN = "/media/Sample Library";
const FOUND: FoundLibrary = {
  series: 3,
  books: 7,
  lastBackupAtMs: 1_780_000_000_000,
};

type Answer<C extends keyof HomeCommands> = Awaited<
  ReturnType<HomeCommands[C]>
>;
type ChooseAnswer = Answer<"choose">;
type ActAnswer = Answer<"use">;

class RecordingNotices extends Notices {
  readonly shown: Notice[] = [];

  override show(notice: Notice): void {
    this.shown.push(notice);
  }

  override withdraw(): void {}
}

class FakeHome {
  readonly asked = { choose: 0, use: 0, move: 0 };
  readonly notices = new RecordingNotices();
  readonly change: HomeFolderChange;
  #chosen: ChooseAnswer[];
  #acted: ActAnswer;

  constructor(chosen: ChooseAnswer[], acted: ActAnswer = done()) {
    this.#chosen = chosen;
    this.#acted = acted;
    this.change = new HomeFolderChange(
      {
        choose: () => {
          this.asked.choose += 1;
          const answer = this.#chosen.shift();
          if (answer === undefined) {
            throw new Error("the chooser opened more often than expected");
          }
          return Promise.resolve(answer);
        },
        use: () => {
          this.asked.use += 1;
          return Promise.resolve(this.#acted);
        },
        move: () => {
          this.asked.move += 1;
          return Promise.resolve(this.#acted);
        },
      },
      () => this.notices,
    );
  }

  get titles(): string[] {
    return this.notices.shown.map((notice) => notice.title);
  }
}

function chose(choice: HomeChoice): ChooseAnswer {
  const data: ChosenHomeFolder = { location: CHOSEN, choice };
  return { status: "ok", data };
}

function cancelled(): ChooseAnswer {
  return { status: "ok", data: null };
}

function failed(code: IpcErrorCode): {
  status: "error";
  error: { code: IpcErrorCode; message: string };
} {
  return { status: "error", error: { code, message: "sample failure" } };
}

function done(): ActAnswer {
  return { status: "ok", data: null };
}

test("stays idle when the chooser is cancelled", async () => {
  const home = new FakeHome([cancelled()]);

  await home.change.choose();

  expect([home.change.change.kind, home.titles]).toEqual(["idle", []]);
});

test("stays idle when the current home folder is chosen again", async () => {
  const home = new FakeHome([chose({ kind: "current" })]);

  await home.change.choose();

  expect([home.change.change.kind, home.asked.move, home.titles]).toEqual([
    "idle",
    0,
    [],
  ]);
});

test("offers the library already in the chosen folder", async () => {
  const home = new FakeHome([chose({ kind: "found", library: FOUND })]);

  await home.change.choose();

  expect([home.change.found, home.asked.use]).toEqual([
    { location: CHOSEN, library: FOUND },
    0,
  ]);
});

test("moves the library into an empty folder straight away", async () => {
  const home = new FakeHome([chose({ kind: "empty" })]);

  await home.change.choose();

  expect([home.asked.move, home.change.change.kind]).toEqual([1, "moving"]);
});

test("stays busy after a move, since the app restarts", async () => {
  const home = new FakeHome([chose({ kind: "empty" })]);

  await home.change.choose();

  expect(home.change.isBusy).toBe(true);
});

test("warns that a folder inside or around the home folder won't do", async () => {
  const home = new FakeHome([chose({ kind: "overlapsHome" })]);

  await home.change.choose();

  expect([home.change.change.kind, home.asked.move, home.titles]).toEqual([
    "idle",
    0,
    [m.home_choice_overlaps_title()],
  ]);
});

test("warns that a library from a newer Omnileaf can't be used", async () => {
  const home = new FakeHome([chose({ kind: "foundFromANewerVersion" })]);

  await home.change.choose();

  expect([home.change.change.kind, home.titles]).toEqual([
    "idle",
    [m.home_choice_newer_title()],
  ]);
});

test("keeps the found library when the chooser is cancelled after it", async () => {
  const home = new FakeHome([
    chose({ kind: "found", library: FOUND }),
    cancelled(),
  ]);
  await home.change.choose();

  await home.change.choose();

  expect(home.change.found).toEqual({ location: CHOSEN, library: FOUND });
});

test("uses the found library", async () => {
  const home = new FakeHome([chose({ kind: "found", library: FOUND })]);
  await home.change.choose();

  await home.change.use();

  expect([home.asked.use, home.change.change.kind]).toEqual([1, "using"]);
});

test("forgets the found library once cleared", async () => {
  const home = new FakeHome([chose({ kind: "found", library: FOUND })]);
  await home.change.choose();

  home.change.clearFound();

  expect([home.change.found, home.change.change.kind]).toEqual([
    undefined,
    "idle",
  ]);
});

test.each([
  {
    code: "folderUnreadable",
    title: m.library_folder_unreadable_title(),
    action: m.library_choose_another_folder(),
  },
  {
    code: "folderChooserMissing",
    title: m.library_folder_chooser_missing_title(),
    action: m.home_change_try_again(),
  },
  {
    code: "internal",
    title: m.home_change_failed_title(),
    action: m.library_choose_another_folder(),
  },
] as const)(
  "warns when choosing fails with $code, offering a way on",
  async ({ code, title, action }) => {
    const home = new FakeHome([failed(code)]);

    await home.change.choose();

    expect([
      home.change.change.kind,
      home.notices.shown.map((notice) => [
        notice.tone,
        notice.title,
        notice.action?.label,
      ]),
    ]).toEqual(["idle", [["warning", title, action]]]);
  },
);

test("chooses again from a warning's action", async () => {
  const home = new FakeHome([failed("folderUnreadable"), cancelled()]);
  await home.change.choose();

  home.notices.shown[0]?.action?.run();
  await Promise.resolve();

  expect(home.asked.choose).toBe(2);
});

test("opens one chooser at a time", async () => {
  const home = new FakeHome([cancelled(), cancelled()]);

  const first = home.change.choose();
  const busyWhileChoosing = home.change.isBusy;
  await home.change.choose();
  await first;

  expect([busyWhileChoosing, home.asked.choose]).toEqual([true, 1]);
});

test("warns and lets the folder be changed again when the move fails", async () => {
  const home = new FakeHome([chose({ kind: "empty" })], failed("internal"));

  await home.change.choose();

  expect([home.change.change.kind, home.change.isBusy, home.titles]).toEqual([
    "idle",
    false,
    [m.home_change_failed_title()],
  ]);
});

test("warns and keeps the found library when using it fails", async () => {
  const home = new FakeHome(
    [chose({ kind: "found", library: FOUND })],
    failed("internal"),
  );
  await home.change.choose();

  await home.change.use();

  expect([home.change.found, home.change.isBusy, home.titles]).toEqual([
    { location: CHOSEN, library: FOUND },
    false,
    [m.home_change_failed_title()],
  ]);
});

test("keeps the found library while using it", async () => {
  const home = new FakeHome([chose({ kind: "found", library: FOUND })]);
  await home.change.choose();

  const using = home.change.use();
  const foundWhileUsing = home.change.found;
  await using;

  expect([foundWhileUsing, home.change.found]).toEqual([
    { location: CHOSEN, library: FOUND },
    { location: CHOSEN, library: FOUND },
  ]);
});

test("keeps the found library while choosing another folder", async () => {
  const home = new FakeHome([
    chose({ kind: "found", library: FOUND }),
    cancelled(),
  ]);
  await home.change.choose();

  const choosing = home.change.choose();
  const foundWhileChoosing = home.change.found;
  await choosing;

  expect(foundWhileChoosing).toEqual({ location: CHOSEN, library: FOUND });
});

test("finds no library while choosing from no library", async () => {
  const home = new FakeHome([cancelled()]);

  const choosing = home.change.choose();
  const foundWhileChoosing = home.change.found;
  await choosing;

  expect(foundWhileChoosing).toBeUndefined();
});
