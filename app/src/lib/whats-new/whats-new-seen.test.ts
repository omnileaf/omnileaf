import { expect, test } from "vitest";

import type {
  LastSeen,
  VersionNotes,
  WhatsNewNotice,
} from "#lib/ipc/bindings.ts";
import type { PreferenceStore } from "#lib/preferences/stored-preference.ts";

import { type AskNotice, WhatsNewSeen } from "./whats-new-seen.ts";

const INSTALLED = "0.2.0";
const SEEN_KEY = "omnileaf.whatsNewSeen";
const NOTES: VersionNotes = {
  version: INSTALLED,
  entries: [{ kind: "feat", summary: "Series pages show tabs" }],
};

function memoryStore(): PreferenceStore & {
  readonly values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function answering(notice: WhatsNewNotice) {
  const asked: LastSeen[] = [];
  const ask: AskNotice = (lastSeen) => {
    asked.push(lastSeen);
    return Promise.resolve(notice);
  };
  return { ask, asked };
}

test("asks with nothing seen while no version is kept, and gives the notes to show", async () => {
  const { ask, asked } = answering({ kind: "show", notes: NOTES });
  const seen = new WhatsNewSeen(memoryStore());

  const notes = await seen.notesToShow(INSTALLED, ask);

  expect([asked, notes]).toEqual([[{ kind: "notRecorded" }], NOTES]);
});

test("keeps the version whose notes were dismissed and asks with it next time", async () => {
  const store = memoryStore();
  new WhatsNewSeen(store).dismissed(NOTES);
  const { ask, asked } = answering({ kind: "nothing" });

  await new WhatsNewSeen(store).notesToShow(INSTALLED, ask);

  expect(asked).toEqual([{ kind: "version", version: INSTALLED }]);
});

test("keeps the installed version without showing anything when told to record it", async () => {
  const store = memoryStore();
  const { ask } = answering({ kind: "record" });

  const notes = await new WhatsNewSeen(store).notesToShow(INSTALLED, ask);

  expect([notes, store.values.get(SEEN_KEY)]).toEqual([undefined, INSTALLED]);
});

test("keeps nothing and shows nothing when told nothing", async () => {
  const store = memoryStore();
  const { ask } = answering({ kind: "nothing" });

  const notes = await new WhatsNewSeen(store).notesToShow(INSTALLED, ask);

  expect([notes, store.values.size]).toEqual([undefined, 0]);
});

test("shows the notes once a run even where nothing can be kept", async () => {
  const seen = new WhatsNewSeen(undefined);
  const { ask, asked } = answering({ kind: "show", notes: NOTES });
  await seen.notesToShow(INSTALLED, ask);
  seen.shown();

  const again = await seen.notesToShow(INSTALLED, ask);

  expect([again, asked.length]).toEqual([undefined, 1]);
});

test("keeps the installed version when first launch finishes on a build with notes", async () => {
  const store = memoryStore();
  const { ask, asked } = answering({ kind: "record" });

  await new WhatsNewSeen(store).recordFirstInstall(INSTALLED, ask);

  expect([asked, store.values.get(SEEN_KEY)]).toEqual([
    [{ kind: "firstInstall" }],
    INSTALLED,
  ]);
});

test("keeps nothing when first launch finishes on a build without notes", async () => {
  const store = memoryStore();
  const { ask } = answering({ kind: "nothing" });

  await new WhatsNewSeen(store).recordFirstInstall(INSTALLED, ask);

  expect(store.values.size).toBe(0);
});
