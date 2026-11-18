import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
import { WindowWidth } from "#lib/page/breakpoints.ts";
import { currentPlatform, isPhone } from "#lib/page/platform.ts";

import type { AboutLook } from "./look.ts";

export class CurrentAboutLook {
  readonly #platform = currentPlatform();
  readonly #width = new WindowWidth();
  readonly #android = new AndroidPhone();

  get current(): AboutLook {
    if (this.#android.isOn) {
      return "android";
    }
    return isPhone(this.#platform, this.#width.current) ? "phone" : "pane";
  }
}
