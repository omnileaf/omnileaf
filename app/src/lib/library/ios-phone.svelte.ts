import { WindowWidth } from "#lib/page/breakpoints.ts";
import { currentPlatform, phoneOf } from "#lib/page/platform.ts";

export class IosPhone {
  readonly #width = new WindowWidth();
  readonly #platform = currentPlatform();

  get isOn(): boolean {
    return phoneOf(this.#platform, this.#width.current) === "ios";
  }
}
