import type { Channel } from "@tauri-apps/api/core";

import { type BackSwipe, commands, type SwipeEdge } from "#lib/ipc/bindings.ts";

import { sendingNewest } from "./newest-call";

let holder: symbol | undefined;
const allowNewest = sendingNewest(commands.allowBackSwipe);

export const watchBackSwipes = sendingNewest((channel: Channel<BackSwipe>) =>
  commands.watchBackSwipes(channel),
);

export class BackSwipeAllowance {
  readonly #id = Symbol("back swipe allowance");

  allow(edge: SwipeEdge | null): void {
    holder = this.#id;
    allowNewest(edge);
  }

  withdraw(): void {
    if (holder !== this.#id) {
      return;
    }
    holder = undefined;
    allowNewest(null);
  }
}
