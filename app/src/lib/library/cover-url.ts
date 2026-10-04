import type { LibrarySeries } from "#lib/ipc/bindings.ts";
import { omniUrl } from "#lib/omni/omni-url.ts";

export type CoverPath = NonNullable<LibrarySeries["cover"]>;

export type CoverUrl = (path: CoverPath) => string;

export const coverUrl: CoverUrl = omniUrl;
