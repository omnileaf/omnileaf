import { Linter } from "eslint";
import { expect, test } from "vitest";

import { REPORT_ERROR_ONLY_CALLED } from "../../eslint.config.js";

const linter = new Linter();

function flaggedLines(code: string): number[] {
  return linter
    .verify(code, [
      {
        rules: { "no-restricted-syntax": ["error", REPORT_ERROR_ONLY_CALLED] },
      },
    ])
    .map((message) => message.line);
}

test("flags reportError handed on as a value", () => {
  const code = [
    "new StorageCheck(commands, reportError);",
    "const engine = { reportFailure: reportError };",
    "promise.catch(reportError);",
    "listen(handler, window.reportError);",
  ].join("\n");

  expect(flaggedLines(code)).toEqual([1, 2, 3, 4]);
});

test("lets reportError be called where the error is handled", () => {
  const code = [
    "reportError(error);",
    "window.reportError(error);",
    "promise.catch((error) => { reportError(error); });",
  ].join("\n");

  expect(flaggedLines(code)).toEqual([]);
});
