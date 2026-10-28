import { expect, test } from "vitest";

import type { IpcError, PageTurn } from "#lib/ipc/bindings.ts";

import {
  hasVolumeKeys,
  type VolumeKeyCommands,
  VolumeKeys,
} from "./volume-keys";

type CommandResult = Awaited<ReturnType<VolumeKeyCommands["release"]>>;
type Answer = () => Promise<CommandResult>;

const DONE: CommandResult = { status: "ok", data: null };
const NO_ACTIVITY: IpcError = {
  code: "internal",
  message: "capture volume keys: no activity is showing",
};

function fakeCommands(answers: { capture?: Answer; release?: Answer } = {}) {
  const sent: string[] = [];
  let heard: (turn: PageTurn) => void = () => undefined;
  const commands: VolumeKeyCommands = {
    capture: (onTurn) => {
      sent.push("capture");
      heard = onTurn;
      return answers.capture?.() ?? Promise.resolve(DONE);
    },
    release: () => {
      sent.push("release");
      return answers.release?.() ?? Promise.resolve(DONE);
    },
  };
  const press = (turn: PageTurn) => {
    heard(turn);
  };
  return { sent, commands, press };
}

function settled(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve);
  });
}

const ignoreErrors = () => undefined;

test("turns pages with the volume keys only on Android", () => {
  const platforms = ["android", "ios", "linux", "macos", "windows"] as const;

  const found = platforms.map((platform) => hasVolumeKeys(platform));

  expect(found).toEqual([true, false, false, false, false]);
});

test("hands each turn the keys send to the reader", async () => {
  const fake = fakeCommands();
  const turns: PageTurn[] = [];
  new VolumeKeys(fake.commands).follow(
    (turn) => turns.push(turn),
    ignoreErrors,
  );
  await settled();

  fake.press("next");
  fake.press("previous");

  expect(turns).toEqual(["next", "previous"]);
});

test("lets the keys go when the reader stops following them", async () => {
  const fake = fakeCommands();
  const stopFollowing = new VolumeKeys(fake.commands).follow(
    () => undefined,
    ignoreErrors,
  );

  stopFollowing();
  stopFollowing();
  await settled();

  expect(fake.sent).toEqual(["capture", "release"]);
});

test("asks for the keys again only after the last release has finished", async () => {
  const release = Promise.withResolvers<CommandResult>();
  const fake = fakeCommands({ release: () => release.promise });
  const keys = new VolumeKeys(fake.commands);
  keys.follow(() => undefined, ignoreErrors)();
  keys.follow(() => undefined, ignoreErrors);
  await settled();
  const whileReleasing = [...fake.sent];

  release.resolve(DONE);
  await settled();

  expect([whileReleasing, fake.sent]).toEqual([
    ["capture", "release"],
    ["capture", "release", "capture"],
  ]);
});

test("keeps the next book's keys when the last book lets go late", async () => {
  const fake = fakeCommands();
  const keys = new VolumeKeys(fake.commands);
  const lastBook = keys.follow(() => undefined, ignoreErrors);
  const nextBook = keys.follow(() => undefined, ignoreErrors);

  lastBook();
  await settled();
  const afterLastBook = [...fake.sent];
  nextBook();
  await settled();

  expect([afterLastBook, fake.sent]).toEqual([
    ["capture", "capture"],
    ["capture", "capture", "release"],
  ]);
});

test("keeps sending after a command throws", async () => {
  const fake = fakeCommands({
    release: () => Promise.reject(new Error("release volume keys: gone")),
  });
  const keys = new VolumeKeys(fake.commands);
  const errors: unknown[] = [];
  keys.follow(
    () => undefined,
    (error) => errors.push(error),
  )();

  keys.follow(() => undefined, ignoreErrors);
  await settled();

  expect([fake.sent, errors.length]).toEqual([
    ["capture", "release", "capture"],
    1,
  ]);
});

test("passes on a capture Android refused", async () => {
  const fake = fakeCommands({
    capture: () => Promise.resolve({ status: "error", error: NO_ACTIVITY }),
  });
  const errors: unknown[] = [];

  new VolumeKeys(fake.commands).follow(
    () => undefined,
    (error) => errors.push(error),
  );
  await settled();

  expect(errors).toEqual([NO_ACTIVITY]);
});
