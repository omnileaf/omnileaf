import type { AfterNavigate } from "@sveltejs/kit";

import { afterNavigate, beforeNavigate, goto } from "$app/navigation";

import { type HistoryMove, moveTo } from "./up-history";

type Replacing = Extract<HistoryMove, { kind: "replace" }>;

export interface BackGoesUp {
  /** True while back passes through a page on the way to the one a link asked for, which should not take focus. */
  readonly isPassingThrough: boolean;
}

/** Shapes the history as links are followed so back goes up a level, as Android's back button should, instead of retracing every page. */
export function makeBackGoUp(): BackGoesUp {
  let entries: readonly string[] = [];
  let isPassingThrough = false;
  let isReplacing = false;
  let settle: (() => void) | undefined;

  function record({ type, to, delta }: AfterNavigate): void {
    const pathname = to?.url.pathname;
    if (pathname === undefined) {
      return;
    }
    if (type === "enter") {
      entries = [pathname];
    } else if (type === "popstate" && delta < 0) {
      entries = entries.slice(0, delta);
    } else if (isReplacing) {
      entries = [...entries.slice(0, -1), pathname];
    } else if (entries.at(-1) !== pathname) {
      entries = [...entries, pathname];
    }
  }

  function goBack(steps: number): Promise<void> {
    return new Promise((arrived) => {
      settle = arrived;
      history.go(-steps);
    });
  }

  async function passThrough(steps: number): Promise<void> {
    isPassingThrough = true;
    try {
      await goBack(steps);
    } finally {
      isPassingThrough = false;
    }
  }

  async function replace(move: Replacing, target: URL): Promise<void> {
    if (move.stepsBack > 0) {
      await passThrough(move.stepsBack);
    }
    isReplacing = true;
    try {
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- the link already resolved its own address
      await goto(target, { replaceState: true });
    } finally {
      isReplacing = false;
    }
  }

  beforeNavigate(({ type, to, cancel }) => {
    if (type !== "link" || to === null || to.route.id === null) {
      return;
    }
    const planned = moveTo(entries, to.url.pathname);
    switch (planned.kind) {
      case "push":
        return;
      case "back":
        cancel();
        void goBack(planned.steps);
        return;
      case "replace":
        cancel();
        void replace(planned, to.url);
        return;
      default:
        assertNever(planned);
    }
  });

  afterNavigate((navigation) => {
    record(navigation);
    settle?.();
    settle = undefined;
  });

  return {
    get isPassingThrough() {
      return isPassingThrough;
    },
  };
}

function assertNever(value: never): never {
  throw new Error(`unexpected history move ${JSON.stringify(value)}`);
}
