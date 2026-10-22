import { mkdir, readdir, rm, writeFile } from "node:fs/promises";

import tokens from "../src/lib/theme/tokens.json" with { type: "json" };
import { renderPlatformTokens } from "./platform-tokens.ts";

const GENERATED = new URL("../src/lib/theme/generated/", import.meta.url);

const files = renderPlatformTokens(tokens);

await mkdir(GENERATED, { recursive: true });
for (const stale of await readdir(GENERATED)) {
  if (!files.has(stale)) {
    await rm(new URL(stale, GENERATED));
  }
}
for (const [name, css] of files) {
  await writeFile(new URL(name, GENERATED), css);
}
