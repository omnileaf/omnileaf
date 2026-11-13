import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import {
  jobSteps,
  ungatedSigningSteps,
} from "../../scripts/release-workflow.ts";

const WORKFLOW = readFileSync(
  new URL("../../../.github/workflows/release.yml", import.meta.url),
  "utf8",
);

test("runs nothing in the iOS job after its secrets check unless the secrets are set", () => {
  expect(
    ungatedSigningSteps(WORKFLOW, "ios", "Check for the iOS signing secrets"),
  ).toEqual([]);
});

test("runs nothing in the Android job after its keystore check unless the keystore is set", () => {
  expect(
    ungatedSigningSteps(WORKFLOW, "android", "Use the release keystore"),
  ).toEqual([]);
});

test("reads the iOS signing secrets only in gated steps and the check", () => {
  const readers = jobSteps(WORKFLOW, "ios").filter((step) => step.readsSecrets);

  expect(readers.length).toBeGreaterThan(1);
  for (const step of readers) {
    expect(
      step.isGated || step.text.includes("Check for the iOS signing secrets"),
    ).toBe(true);
  }
});

test("lists the iOS job among what the draft release waits for", () => {
  expect(WORKFLOW).toMatch(/needs: \[version, desktop, android, ios\]/u);
});

test("names a step ungated when its if line lacks the secrets check", () => {
  const workflow = `jobs:
  demo:
    steps:
      - name: Check
        id: signing
        run: true
      - name: Sign
        run: true
`;

  expect(ungatedSigningSteps(workflow, "demo", "Check")).toEqual([
    "name: Sign",
  ]);
});
