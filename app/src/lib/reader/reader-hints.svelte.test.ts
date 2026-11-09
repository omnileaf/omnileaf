import { expect, test } from "vitest";

import { ReaderHints } from "./reader-hints.svelte";

const TAP_GUIDE_KEY = "omnileaf.readerHints.tapGuide";
const RESUME_NOTICE_KEY = "omnileaf.readerHints.resumeNotice";
const REPLAY_KEY = "omnileaf.readerHints.replayGuide";

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const refusingStore = {
  getItem: (): string | null => {
    throw new Error("storage is off");
  },
  setItem: () => {
    throw new Error("storage is off");
  },
};

test("shows the tap guide until the person turns it off", () => {
  const hints = new ReaderHints(memoryStore());

  expect(hints.showsTapGuide).toBe(true);

  hints.turnTapGuide(false);

  expect(hints.showsTapGuide).toBe(false);
});

test("remembers the tap guide choice in the next session", () => {
  const store = memoryStore();
  new ReaderHints(store).turnTapGuide(false);

  expect(store.values.get(TAP_GUIDE_KEY)).toBe("off");
  expect(new ReaderHints(store).showsTapGuide).toBe(false);
});

test("says where a book opened on tablets and computers but not on phones, until the person chooses", () => {
  const hints = new ReaderHints(memoryStore());

  expect([
    hints.showsResumeNotice(false),
    hints.showsResumeNotice(true),
  ]).toEqual([true, false]);
});

test("lets the person's choice of the resume notice win on a phone and elsewhere", () => {
  const hints = new ReaderHints(memoryStore());

  hints.turnResumeNotice(true);
  const onAPhone = hints.showsResumeNotice(true);
  hints.turnResumeNotice(false);

  expect([onAPhone, hints.showsResumeNotice(false)]).toEqual([true, false]);
});

test("remembers the resume notice choice in the next session", () => {
  const store = memoryStore();
  new ReaderHints(store).turnResumeNotice(true);

  expect(store.values.get(RESUME_NOTICE_KEY)).toBe("on");
  expect(new ReaderHints(store).showsResumeNotice(true)).toBe(true);
});

test("ignores a stored value it does not know", () => {
  const hints = new ReaderHints(
    memoryStore({ [TAP_GUIDE_KEY]: "sometimes", [RESUME_NOTICE_KEY]: "" }),
  );

  expect([hints.showsTapGuide, hints.showsResumeNotice(false)]).toEqual([
    true,
    true,
  ]);
});

test("owes the guide only when it has not been seen and the guide is on", () => {
  const hints = new ReaderHints(memoryStore());

  const due = [hints.isGuideDue(false), hints.isGuideDue(true)];
  hints.turnTapGuide(false);

  expect([...due, hints.isGuideDue(false)]).toEqual([true, false, false]);
});

test("plays the guide once more even when it is seen and turned off", () => {
  const hints = new ReaderHints(memoryStore());
  hints.turnTapGuide(false);

  hints.armReplay();
  const armed = hints.isGuideDue(true);
  hints.disarmReplay();

  expect([armed, hints.isGuideDue(true)]).toEqual([true, false]);
});

test("keeps a replay waiting for the next time the reader opens", () => {
  const store = memoryStore();
  new ReaderHints(store).armReplay();

  expect(store.values.get(REPLAY_KEY)).toBe("armed");
  expect(new ReaderHints(store).isReplayArmed).toBe(true);
});

test("works from memory when storage refuses", () => {
  const hints = new ReaderHints(refusingStore);

  hints.turnTapGuide(false);
  hints.armReplay();

  expect([hints.showsTapGuide, hints.isReplayArmed]).toEqual([false, true]);
});
