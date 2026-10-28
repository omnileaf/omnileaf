import { expect, test } from "vitest";

import type { DropMode, DropOutcome, DropSummary } from "#lib/ipc/bindings.ts";

import type { DropTarget } from "./drop-target-at.ts";
import { type DropPorts, FileDrop } from "./file-drop.svelte.ts";
import type { Point } from "./window-drag.ts";

const PATHS = ["/a/One.cbz", "/a/Two.cbz"];
const AT: Point = { x: 5, y: 5 };
const USABLE: DropSummary = {
  first: "One.cbz",
  more: 1,
  totalKilobytes: 2000,
  refused: [],
};
const READING: DropOutcome = {
  kind: "reading",
  book: "book" as never,
  isInLibrary: false,
};

class Ports implements DropPorts {
  summary: Promise<DropSummary> = Promise.resolve(USABLE);
  outcome: Promise<DropOutcome> = Promise.resolve(READING);
  target: DropTarget | null = null;
  readonly dropped: { paths: string[]; mode: DropMode }[] = [];
  readonly outcomes: { outcome: DropOutcome; mode: DropMode }[] = [];
  readonly failures: unknown[] = [];

  inspect = (): Promise<DropSummary> => this.summary;
  drop = (paths: string[], mode: DropMode): Promise<DropOutcome> => {
    this.dropped.push({ paths, mode });
    return this.outcome;
  };
  targetAt = (): DropTarget | null => this.target;
  onDropped = (outcome: DropOutcome, mode: DropMode): void => {
    this.outcomes.push({ outcome, mode });
  };
  onFailed = (error: unknown): void => {
    this.failures.push(error);
  };
}

async function entered(ports: Ports): Promise<FileDrop> {
  const drop = new FileDrop(ports);
  await drop.handle({ kind: "enter", paths: PATHS, at: AT });
  return drop;
}

test("offers the two targets for files the library can use", async () => {
  const drop = await entered(new Ports());

  expect(drop.state).toEqual({
    kind: "offering",
    summary: USABLE,
    over: null,
    copies: false,
  });
});

test("follows the target under the pointer", async () => {
  const ports = new Ports();
  const drop = await entered(ports);

  ports.target = "add";
  await drop.handle({ kind: "over", at: AT });

  expect(drop.state).toMatchObject({ kind: "offering", over: "add" });
});

test("reads the files now when dropped on that target", async () => {
  const ports = new Ports();
  const drop = await entered(ports);

  ports.target = "readNow";
  await drop.handle({ kind: "drop", paths: PATHS, at: AT });

  expect(ports.dropped).toEqual([{ paths: PATHS, mode: "readNow" }]);
  expect(ports.outcomes).toEqual([{ outcome: READING, mode: "readNow" }]);
  expect(drop.state).toEqual({ kind: "idle" });
});

test("adds the files' folder when dropped on that target", async () => {
  const ports = new Ports();
  const drop = await entered(ports);

  ports.target = "add";
  await drop.handle({ kind: "drop", paths: PATHS, at: AT });

  expect(ports.dropped).toEqual([{ paths: PATHS, mode: "add" }]);
});

test("copies the files instead while Alt is held on the adding target", async () => {
  const ports = new Ports();
  const drop = await entered(ports);
  drop.setAltHeld(true);

  expect(drop.state).toMatchObject({ kind: "offering", copies: true });
  ports.target = "add";
  await drop.handle({ kind: "drop", paths: PATHS, at: AT });

  expect(ports.dropped).toEqual([{ paths: PATHS, mode: "copy" }]);
});

test("keeps reading now as it was while Alt is held", async () => {
  const ports = new Ports();
  const drop = await entered(ports);
  drop.setAltHeld(true);

  ports.target = "readNow";
  await drop.handle({ kind: "drop", paths: PATHS, at: AT });

  expect(ports.dropped).toEqual([{ paths: PATHS, mode: "readNow" }]);
});

test("remembers Alt held before the drag came in, and lets go of it", async () => {
  const ports = new Ports();
  const drop = new FileDrop(ports);
  drop.setAltHeld(true);
  await drop.handle({ kind: "enter", paths: PATHS, at: AT });
  drop.setAltHeld(false);

  expect(drop.state).toMatchObject({ kind: "offering", copies: false });
});

test("does nothing when dropped away from both targets", async () => {
  const ports = new Ports();
  const drop = await entered(ports);

  await drop.handle({ kind: "drop", paths: PATHS, at: AT });

  expect(ports.dropped).toEqual([]);
  expect(drop.state).toEqual({ kind: "idle" });
});

test("explains why nothing was added when every file is refused", async () => {
  const ports = new Ports();
  const refused = [{ name: "notes.pdf", reason: "notAComic" as const }];
  ports.summary = Promise.resolve({
    first: null,
    more: 0,
    totalKilobytes: 0,
    refused,
  });
  const drop = await entered(ports);
  expect(drop.state).toEqual({ kind: "refused", refused });

  ports.target = "add";
  await drop.handle({ kind: "drop", paths: PATHS, at: AT });

  expect(ports.dropped).toEqual([]);
  expect(drop.state).toEqual({ kind: "idle" });
});

test("shows nothing for a drag holding nothing at all", async () => {
  const ports = new Ports();
  ports.summary = Promise.resolve({
    first: null,
    more: 0,
    totalKilobytes: 0,
    refused: [],
  });

  const drop = await entered(ports);

  expect(drop.state).toEqual({ kind: "idle" });
});

test("goes away when the drag leaves", async () => {
  const drop = await entered(new Ports());

  await drop.handle({ kind: "leave" });

  expect(drop.state).toEqual({ kind: "idle" });
});

test("ignores what was found out about a drag that has already left", async () => {
  const ports = new Ports();
  let finish: (summary: DropSummary) => void = () => undefined;
  ports.summary = new Promise((resolve) => {
    finish = resolve;
  });
  const drop = new FileDrop(ports);

  const entering = drop.handle({ kind: "enter", paths: PATHS, at: AT });
  await drop.handle({ kind: "leave" });
  finish(USABLE);
  await entering;

  expect(drop.state).toEqual({ kind: "idle" });
});

test("acts on a drop that comes before the files were looked at", async () => {
  const ports = new Ports();
  let finish: (summary: DropSummary) => void = () => undefined;
  ports.summary = new Promise((resolve) => {
    finish = resolve;
  });
  const drop = new FileDrop(ports);

  const entering = drop.handle({ kind: "enter", paths: PATHS, at: AT });
  ports.target = "readNow";
  const dropping = drop.handle({ kind: "drop", paths: PATHS, at: AT });
  finish(USABLE);
  await Promise.all([entering, dropping]);

  expect(ports.dropped).toEqual([{ paths: PATHS, mode: "readNow" }]);
});

test("reports a failed look at the files and offers nothing", async () => {
  const ports = new Ports();
  const failure = new Error("could not look");
  ports.summary = Promise.reject(failure);

  const drop = await entered(ports);

  expect(ports.failures).toEqual([failure]);
  expect(drop.state).toEqual({ kind: "idle" });
});

test("reports a drop that fails", async () => {
  const ports = new Ports();
  const failure = new Error("could not open");
  ports.outcome = Promise.reject(failure);
  const drop = await entered(ports);

  ports.target = "readNow";
  await drop.handle({ kind: "drop", paths: PATHS, at: AT });

  expect(ports.failures).toEqual([failure]);
  expect(ports.outcomes).toEqual([]);
});
