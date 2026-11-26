import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

import { setStepOutput, writeStepSummary } from "../github-output.ts";

function scratchFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), "omnileaf-output-")), "file");
  writeFileSync(file, "first\n");
  return file;
}

test("adds a summary after what earlier steps wrote to the job summary", () => {
  const file = scratchFile();

  writeStepSummary({ GITHUB_STEP_SUMMARY: file }, "second\n");

  expect(readFileSync(file, "utf8")).toBe("first\nsecond\n");
});

test("prints the summary when no job summary file is named", () => {
  const print = vi.spyOn(console, "log").mockImplementation(() => undefined);

  writeStepSummary({}, "second\n");

  expect(print).toHaveBeenCalledWith("second\n");
  print.mockRestore();
});

test("adds an output line after what earlier steps wrote", () => {
  const file = scratchFile();

  setStepOutput({ GITHUB_OUTPUT: file }, "flaky", "true");

  expect(readFileSync(file, "utf8")).toBe("first\nflaky=true\n");
});

test("leaves an output alone when no output file is named", () => {
  expect(() => {
    setStepOutput({}, "flaky", "true");
  }).not.toThrow();
});
