import { Channel } from "@tauri-apps/api/core";

import { type BackSwipe, commands, type SwipeEdge } from "#lib/ipc/bindings.ts";

import { sendingNewest } from "./newest-call";

let holder: symbol | undefined;
const allowNewest = sendingNewest(commands.allowBackSwipe);

const sendWatching = sendingNewest((channel: Channel<BackSwipe>) =>
  commands.watchBackSwipes(channel),
);

/** The phone keeps only the newest channel it is given and cannot be told to drop one, so a watcher that stops silences its own channel here. */
export function watchBackSwipes(
  onSwipe: (swipe: BackSwipe) => void,
): () => void {
  let isWatching = true;
  sendWatching(
    new Channel<BackSwipe>((swipe) => {
      if (isWatching) {
        onSwipe(swipe);
      }
    }),
  );
  return () => {
    isWatching = false;
  };
}

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
