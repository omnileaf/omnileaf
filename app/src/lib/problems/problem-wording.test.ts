import { expect, test } from "vitest";

import type { FolderProblem, MissingFolder } from "#lib/ipc/bindings.ts";
import { folderStandIn } from "#lib/screenshot-mode/stand-ins.ts";
import type { DeviceWord } from "#lib/storage/device.ts";

import type { Problem } from "./needs-attention.svelte";
import { problemWording } from "./problem-wording";

const NAS = { server: "nas", name: "comics" };

function problemOf(kind: FolderProblem["kind"]): FolderProblem {
  return kind === "needsSignIn" ||
    kind === "needsMounting" ||
    kind === "shareUnreachable"
    ? { kind, share: NAS }
    : { kind };
}

function missingFolder(
  kind: FolderProblem["kind"],
  isShownAnyway = false,
): Problem {
  return {
    kind: "missingFolder",
    missing: {
      folder: {
        id: "5a4d1e00-0000-4000-8002-000000000002",
        kind: "linked",
        name: "Comics",
        location: "nas/comics",
        isAvailable: false,
      },
      problem: problemOf(kind),
      hiddenSeries: 41,
      isShownAnyway,
    } as MissingFolder,
  };
}

function wordsOf(
  problem: Problem,
  usesStandIns = false,
  device: DeviceWord = "phone",
) {
  const { title, detail, fix } = problemWording(problem, {
    usesStandIns,
    device,
  });
  return { title, detail, fix };
}

test("says a missing folder isn't there and hides its series until it's back", () => {
  expect(wordsOf(missingFolder("missing"))).toEqual({
    title: "Comics isn’t there",
    detail: "41 series hidden until it’s back",
    fix: "Find it",
  });
});

test("says a folder on a disconnected drive isn't connected", () => {
  expect(wordsOf(missingFolder("driveDisconnected"))).toEqual({
    title: "Comics isn’t connected",
    detail: "41 series hidden until it’s back",
    fix: "Find it",
  });
});

test("offers to choose a folder again once access to it is lost", () => {
  expect(wordsOf(missingFolder("lostAccess"))).toMatchObject({
    title: "Omnileaf can’t open Comics",
    fix: "Choose it again",
  });
});

test("offers to sign in to a network share that asks for it", () => {
  expect(wordsOf(missingFolder("needsSignIn"))).toMatchObject({
    title: "Sign in to see Comics",
    fix: "Sign in",
  });
});

test("offers to try again once a share mounted outside Omnileaf is back", () => {
  expect(wordsOf(missingFolder("needsMounting"))).toMatchObject({
    title: "Mount Comics’s share again",
    fix: "Try again",
  });
});

test("offers to choose a folder on a share that can't be reached again", () => {
  expect(wordsOf(missingFolder("shareUnreachable"))).toMatchObject({
    title: "Omnileaf can’t open Comics",
    fix: "Choose it again",
  });
});

test("says series shown anyway can't be opened until their folder is back", () => {
  expect(wordsOf(missingFolder("missing", true)).detail).toBe(
    "41 series can’t be opened until it’s back",
  );
});

test("names the folder by its stand-in in Screenshot mode", () => {
  expect(wordsOf(missingFolder("missing"), true).title).toBe(
    `${folderStandIn("Comics")} isn’t there`,
  );
});

const LOW_SPACE: Problem = { kind: "lowSpace", freeBytes: 1_100_000_000 };

test("says a phone is almost out of space, how much is left and offers to free some up", () => {
  expect(wordsOf(LOW_SPACE)).toEqual({
    title: "Almost out of space",
    detail: "1.1 GB left on this phone",
    fix: "Free up space",
  });
});

test("says how much is left on a tablet", () => {
  expect(wordsOf(LOW_SPACE, false, "tablet").detail).toBe(
    "1.1 GB left on this tablet",
  );
});

test("says only how much is left on a computer", () => {
  expect(wordsOf(LOW_SPACE, false, "computer").detail).toBe("1.1 GB left");
});
