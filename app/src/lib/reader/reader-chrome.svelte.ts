import { createContext } from "svelte";

import type { Platform } from "#lib/ipc/bindings.ts";
import { WindowWidth, type WidthClass } from "#lib/page/breakpoints.ts";
import { isPhone } from "#lib/page/platform.ts";

import { floatsReaderBars, spansReaderBars } from "./reader-bar.ts";

export class ReaderChrome {
  readonly #width = new WindowWidth();

  constructor(readonly platform: Platform) {}

  get width(): WidthClass {
    return this.#width.current;
  }

  get isOnPhone(): boolean {
    return isPhone(this.platform, this.width);
  }

  get floats(): boolean {
    return floatsReaderBars(this.platform, this.width);
  }

  get spans(): boolean {
    return spansReaderBars(this.platform, this.width);
  }
}

export const [getReaderChrome, setReaderChrome] = createContext<ReaderChrome>();
