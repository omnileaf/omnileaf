import { expect, test, vi } from "vitest";

import type {
  IpcError,
  UpdateNoticeTurning,
  UpdateNoticeWords,
} from "#lib/ipc/bindings.ts";

import {
  type UpdateNoticeAsks,
  UpdateNoticeSetting,
} from "./update-notices.svelte.ts";

const WORDS: UpdateNoticeWords = {
  channel: "Updates",
  title: "Omnileaf {version} is available",
  viewRelease: "View release",
  skip: "Skip this version",
};
const BROKEN: IpcError = {
  code: "internal",
  message: "something went wrong inside the app",
};
const done = () => Promise.resolve({ status: "ok", data: null } as const);
const failures = () => undefined;

function answering(turning: UpdateNoticeTurning): Partial<UpdateNoticeAsks> {
  return { turnOn: () => Promise.resolve({ status: "ok", data: turning }) };
}

function asks(overrides: Partial<UpdateNoticeAsks> = {}): UpdateNoticeAsks {
  return {
    read: () =>
      Promise.resolve({
        status: "ok",
        data: { isOn: false, canShow: true, access: "allowed" },
      }),
    turnOn: () => Promise.resolve({ status: "ok", data: "turnedOn" }),
    turnOff: done,
    rememberWords: done,
    ...overrides,
  };
}

test("reads whether notices are on", async () => {
  const setting = new UpdateNoticeSetting(
    failures,
    asks({
      read: () =>
        Promise.resolve({
          status: "ok",
          data: { isOn: true, canShow: true, access: "allowed" },
        }),
    }),
  );

  await setting.load();

  expect([setting.isOn, setting.isBlocked]).toEqual([true, false]);
});

test("reads notices that are on but that Android won't show as blocked", async () => {
  const setting = new UpdateNoticeSetting(
    failures,
    asks({
      read: () =>
        Promise.resolve({
          status: "ok",
          data: { isOn: true, canShow: false, access: "notAllowed" },
        }),
    }),
  );

  await setting.load();

  expect([setting.isOn, setting.isBlocked]).toEqual([false, true]);
});

test("hands Android the words, then asks to turn notices on", async () => {
  const asked: string[] = [];
  const setting = new UpdateNoticeSetting(
    failures,
    asks({
      rememberWords: (words) => {
        asked.push(`words ${words.title}`);
        return done();
      },
      turnOn: () => {
        asked.push("turn on");
        return Promise.resolve({ status: "ok", data: "turnedOn" });
      },
    }),
  );

  await setting.turnOn(WORDS);

  expect([asked, setting.isOn]).toEqual([
    ["words Omnileaf {version} is available", "turn on"],
    true,
  ]);
});

test("stays off after a no, with the banner as the only notice", async () => {
  const setting = new UpdateNoticeSetting(failures, asks(answering("refused")));

  await setting.turnOn(WORDS);

  expect([setting.isOn, setting.isBlocked]).toEqual([false, false]);
});

test("stays off and points to Android's settings once Android won't ask", async () => {
  const setting = new UpdateNoticeSetting(failures, asks(answering("blocked")));

  await setting.turnOn(WORDS);

  expect([setting.isOn, setting.isBlocked]).toEqual([false, true]);
});

test("clears the pointer to Android's settings once notices turn on", async () => {
  const setting = new UpdateNoticeSetting(
    failures,
    asks(answering("turnedOn")),
  );
  setting.isBlocked = true;

  await setting.turnOn(WORDS);

  expect([setting.isBlocked, setting.isOn]).toEqual([false, true]);
});

test("turns notices off", async () => {
  const setting = new UpdateNoticeSetting(failures, asks());
  await setting.turnOn(WORDS);

  await setting.turnOff();

  expect(setting.isOn).toBe(false);
});

test("shows the switch as asking until Android answers", async () => {
  let answer: () => void = () => undefined;
  const setting = new UpdateNoticeSetting(
    failures,
    asks({
      turnOn: () =>
        new Promise((resolve) => {
          answer = () => {
            resolve({ status: "ok", data: "turnedOn" });
          };
        }),
    }),
  );

  const turning = setting.turnOn(WORDS);
  await Promise.resolve();
  await Promise.resolve();
  const whileAsking = setting.isAsking;
  answer();
  await turning;

  expect([whileAsking, setting.isAsking]).toEqual([true, false]);
});

test("hands on each error and keeps the switch as it was", async () => {
  const onFailure = vi.fn();
  const refuse = () =>
    Promise.resolve({ status: "error", error: BROKEN } as const);
  const setting = new UpdateNoticeSetting(
    onFailure,
    asks({
      read: refuse,
      turnOn: refuse,
      turnOff: refuse,
      rememberWords: refuse,
    }),
  );

  await setting.load();
  await setting.turnOn(WORDS);
  await setting.turnOff();

  expect([setting.isOn, onFailure.mock.calls.length]).toEqual([false, 3]);
});

test("keeps Android's words for a notice in the app's language", async () => {
  const handed: UpdateNoticeWords[] = [];
  const onFailure = vi.fn();
  const setting = new UpdateNoticeSetting(
    onFailure,
    asks({
      rememberWords: (words) => {
        handed.push(words);
        return done();
      },
    }),
  );

  await setting.keepWords(WORDS);

  expect([handed, onFailure.mock.calls]).toEqual([[WORDS], []]);
});

test("reads how Android stands on notifications", async () => {
  const setting = new UpdateNoticeSetting(
    failures,
    asks({
      read: () =>
        Promise.resolve({
          status: "ok",
          data: { isOn: false, canShow: false, access: "notAsked" },
        }),
    }),
  );
  const before = setting.access;

  await setting.load();

  expect([before, setting.access]).toEqual([undefined, "notAsked"]);
});
