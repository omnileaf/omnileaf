import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const RELEASE_WORKFLOW = resolve(
  import.meta.dirname,
  "../../../.github/workflows/release.yml",
);
const ANDROID_BUILD_SCRIPT = resolve(
  import.meta.dirname,
  "../../src-tauri/gen/android/app/build.gradle.kts",
);
const STEP_START = /\n {6}- /;

interface AndroidBuildStep {
  readonly hasCargoFeature: boolean;
  readonly turnsKotlinFlagOn: boolean;
}

async function androidBuildSteps(): Promise<AndroidBuildStep[]> {
  const workflow = await readFile(RELEASE_WORKFLOW, "utf8");
  return workflow
    .split(STEP_START)
    .filter((step) => step.includes("tauri android build"))
    .map((step) => ({
      hasCargoFeature: /--features[^\n]*\bupdate-check\b/.test(step),
      turnsKotlinFlagOn: /\n\s+OMNILEAF_UPDATE_CHECK: "?on"?\n/.test(
        `${step}\n`,
      ),
    }));
}

test("turns the Kotlin update check on exactly where the release builds the APK with the cargo feature", async () => {
  const steps = await androidBuildSteps();

  expect(steps).toEqual([{ hasCargoFeature: true, turnsKotlinFlagOn: true }]);
});

test("reads the Kotlin update check flag from the release's environment", async () => {
  const script = await readFile(ANDROID_BUILD_SCRIPT, "utf8");

  expect(script).toMatch(
    /isBuiltWithUpdateCheck = providers\.environmentVariable\("OMNILEAF_UPDATE_CHECK"\)\.orNull == "on"[\s\S]*buildConfigField\("boolean", "UPDATE_CHECK", isBuiltWithUpdateCheck\.toString\(\)\)/,
  );
});
