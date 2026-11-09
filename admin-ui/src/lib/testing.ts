import { readFileSync } from "node:fs";

import { isReportCode, type Listed, type ReportCode } from "#lib/wire.ts";

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

export function aListed(overrides: Partial<Listed> = {}): Listed {
  return {
    code: aCode("R-1111-1111"),
    receivedAt: 1_700_000_000,
    status: { kind: "received" },
    platform: "linux",
    version: "1.2.0",
    ...overrides,
  };
}
