import { convertFileSrc } from "@tauri-apps/api/core";

import type { LibrarySeries } from "#lib/ipc/bindings.ts";

export type CoverPath = NonNullable<LibrarySeries["cover"]>;

export type CoverUrl = (path: CoverPath) => string;

const OMNI_SCHEME = "omni";

/** Each platform spells the base of a Tauri custom protocol its own way, so `convertFileSrc` builds it. */
export const coverUrl: CoverUrl = (path) =>
  `${convertFileSrc("", OMNI_SCHEME)}${path}`;
