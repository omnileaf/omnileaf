import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

const ANNOUNCER_SOURCE = new URL(
  "../../node_modules/@sveltejs/kit/src/runtime/components/root.svelte",
  import.meta.url,
);
const SERVICE_POLICY = new URL(
  "../../../crates/omnileaf-admin/src/page.rs",
  import.meta.url,
);
const ATTRIBUTE_STYLES = /style-src-attr ([^;"]*)/;
const ANNOUNCER_STYLE = /id="svelte-announcer"[^>]*?\sstyle="([^"]*)"/s;

function announcerStyle(): string {
  const source = readFileSync(ANNOUNCER_SOURCE, { encoding: "utf8" });
  return ANNOUNCER_STYLE.exec(source)?.[1] ?? "";
}

function cspHash(text: string): string {
  return `'sha256-${createHash("sha256").update(text).digest("base64")}'`;
}

test("finds the inline style that SvelteKit puts on its route announcer", () => {
  expect(announcerStyle()).toContain("position: absolute");
});

test("lets the service allow the route announcer style attribute by its hash", () => {
  const policy = readFileSync(SERVICE_POLICY, { encoding: "utf8" });
  const allowed = ATTRIBUTE_STYLES.exec(policy)?.[1]?.split(" ") ?? [];

  expect(allowed).toEqual(["'unsafe-hashes'", cspHash(announcerStyle())]);
});
