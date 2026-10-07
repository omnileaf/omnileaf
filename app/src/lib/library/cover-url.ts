import { convertFileSrc } from "@tauri-apps/api/core";

import type { LibrarySeries } from "$lib/ipc/bindings";

export type CoverPath = NonNullable<LibrarySeries["cover"]>;

export type CoverUrl = (path: CoverPath) => string;

const OMNI_SCHEME = "omni";

/** Where the webview loads a cover from: the app's `omni` protocol, whose base each platform spells its own way, then the path unescaped. */
export const coverUrl: CoverUrl = (path) =>
  `${convertFileSrc("", OMNI_SCHEME)}${path}`;
