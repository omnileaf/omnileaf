import { expect, test } from "vitest";

import type {
  IpcError,
  LibraryCategory,
  LibraryTabId,
} from "#lib/ipc/bindings.ts";

import type { CountSeries } from "./library-series-count.svelte";
import { tabKey } from "./library-tabs";
import { UnfilteredCounts } from "./unfiltered-counts.svelte";

type CountResult = Awaited<ReturnType<CountSeries>>;

type CategoryId = LibraryCategory["id"];

const MANGA: LibraryTabId = { kind: "category", id: "manga" as CategoryId };
const COMICS: LibraryTabId = { kind: "category", id: "comics" as CategoryId };
const FAILURE: IpcError = {
  code: "internal",
  message: "the category could not be counted",
};

interface Answers {
  readonly asked: string[];
  readonly pending: ((result: CountResult) => void)[];
}

function answering(): Answers & {
  readonly countTab: (tab: LibraryTabId) => CountSeries;
} {
  const asked: string[] = [];
  const pending: ((result: CountResult) => void)[] = [];
  return {
    asked,
    pending,
    countTab: (tab) => () => {
      asked.push(tabKey(tab));
      return new Promise((resolve) => {
        pending.push(resolve);
      });
    },
  };
}

function ignoreFailure(): void {
  return;
}

function answersDelivered(): Promise<void> {
  return new Promise((delivered) => {
    setTimeout(delivered, 0);
  });
}

function answerAll(answers: Answers, result: CountResult): Promise<void> {
  for (const answer of answers.pending.splice(0)) {
    answer(result);
  }
  return answersDelivered();
}

test("counts each asked tab", async () => {
  const answers = answering();
  const counts = new UnfilteredCounts(answers.countTab, ignoreFailure);

  counts.ask([MANGA, COMICS]);
  await answerAll(answers, { status: "ok", data: 4 });

  expect(answers.asked).toEqual(["manga", "comics"]);
  expect(counts.of("manga")).toEqual({ kind: "counted", count: 4 });
  expect(counts.of("comics")).toEqual({ kind: "counted", count: 4 });
});

test("counts a tab asked for twice at once only once", () => {
  const answers = answering();
  const counts = new UnfilteredCounts(answers.countTab, ignoreFailure);

  counts.ask([MANGA, MANGA]);

  expect(answers.asked).toEqual(["manga"]);
});

test("is still counting a tab nobody asked for", () => {
  const counts = new UnfilteredCounts(answering().countTab, ignoreFailure);

  const reading = counts.of("manga");

  expect(reading).toEqual({ kind: "counting" });
});

test("keeps the count of a tab asked for again without counting it again", async () => {
  const answers = answering();
  const counts = new UnfilteredCounts(answers.countTab, ignoreFailure);
  counts.ask([MANGA]);
  await answerAll(answers, { status: "ok", data: 4 });

  counts.ask([COMICS, MANGA]);

  expect(answers.asked).toEqual(["manga", "comics"]);
  expect(counts.of("manga")).toEqual({ kind: "counted", count: 4 });
});

test("forgets the count of a tab no longer asked for", async () => {
  const answers = answering();
  const counts = new UnfilteredCounts(answers.countTab, ignoreFailure);
  counts.ask([MANGA]);
  await answerAll(answers, { status: "ok", data: 4 });

  counts.ask([]);

  expect(counts.of("manga")).toEqual({ kind: "counting" });
});

test("drops a count that answers after its tab stopped being asked for", async () => {
  const answers = answering();
  const counts = new UnfilteredCounts(answers.countTab, ignoreFailure);
  counts.ask([MANGA]);
  counts.ask([]);
  counts.ask([MANGA]);

  answers.pending[0]?.({ status: "ok", data: 4 });
  await answersDelivered();

  expect(counts.of("manga")).toEqual({ kind: "counting" });
});

test("counts every asked tab again on refresh", async () => {
  const answers = answering();
  const counts = new UnfilteredCounts(answers.countTab, ignoreFailure);
  counts.ask([MANGA]);
  await answerAll(answers, { status: "ok", data: 4 });

  const refreshed = counts.refresh();
  await answerAll(answers, { status: "ok", data: 5 });
  await refreshed;

  expect(answers.asked).toEqual(["manga", "manga"]);
  expect(counts.of("manga")).toEqual({ kind: "counted", count: 5 });
});

test("reports a count that fails with the tab it counted, and holds it as failed", async () => {
  const answers = answering();
  const failures: { error: IpcError; key: string }[] = [];
  const counts = new UnfilteredCounts(answers.countTab, (error, key) => {
    failures.push({ error, key });
  });

  counts.ask([MANGA]);
  await answerAll(answers, { status: "error", error: FAILURE });

  expect(failures).toEqual([{ error: FAILURE, key: "manga" }]);
  expect(counts.of("manga")).toEqual({ kind: "failed" });
});
