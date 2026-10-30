import { createContext } from "svelte";
import { MediaQuery } from "svelte/reactivity";

import type { Platform } from "#lib/ipc/bindings.ts";
import {
  COMPACT_SIDE_QUERY,
  WindowWidth,
  type WidthClass,
} from "#lib/page/breakpoints.ts";
import { isPhone } from "#lib/page/platform.ts";

import { floatsReaderBars, spansReaderBars } from "./reader-bar.ts";

export class ReaderChrome {
  readonly #width = new WindowWidth();
  readonly #hasCompactSide = new MediaQuery(COMPACT_SIDE_QUERY);

  constructor(readonly platform: Platform) {}

  get width(): WidthClass {
    return this.#width.current;
  }

  get isOnPhone(): boolean {
    return isPhone(this.platform, this.width);
  }

  get isPhoneSized(): boolean {
    return this.#hasCompactSide.current;
  }

  get floats(): boolean {
    return floatsReaderBars(this.platform, this.width);
  }

  get isCommandBar(): boolean {
    return this.platform === "windows";
  }

  get spans(): boolean {
    return spansReaderBars(this.platform, this.width);
  }
}

export const [getReaderChrome, setReaderChrome] = createContext<ReaderChrome>();
