import { readFileSync } from "node:fs";

import { isReportCode, type ReportCode } from "#lib/wire.ts";

export function aCode(text = "R-2222-2222"): ReportCode {
  if (!isReportCode(text)) {
    throw new Error(`${text} is not a report code`);
  }
  return text;
}

const FIXTURES = "../../../crates/omnileaf-admin/tests/fixtures/";

export function fixtureText(name: string): string {
  return readFileSync(new URL(`${FIXTURES}${name}`, import.meta.url), {
    encoding: "utf8",
  });
}
