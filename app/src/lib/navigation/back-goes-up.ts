import type { AfterNavigate } from "@sveltejs/kit";
import { createContext } from "svelte";

import {
  afterNavigate,
  beforeNavigate,
  goto,
  onNavigate,
} from "$app/navigation";

import { type HistoryMove, moveTo } from "./up-history";

type Replacing = Extract<HistoryMove, { kind: "replace" }>;

export interface BackGoesUp {
  /** True while back passes through a page on the way to the one a link asked for, which should not take focus. */
  readonly isPassingThrough: boolean;
  /** Opens `target` in place of the current page, so back skips a page that only leads on to another. */
  replaceWith(target: string | URL): Promise<void>;
}

/** Shapes the history as links are followed so back goes up a level, as Android's back button should, instead of retracing every page. */
export function makeBackGoUp(): BackGoesUp {
  let entries: readonly string[] = [];
  let isMoving = false;
  let isPassingThrough = false;
  const replacing = new Set<string>();
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
    } else if (replacing.has(pathname)) {
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

  async function replaceWith(target: string | URL): Promise<void> {
    const { pathname } = new URL(target, location.href);
    replacing.add(pathname);
    try {
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass an address they already resolved
      await goto(target, { replaceState: true });
    } finally {
      replacing.delete(pathname);
    }
  }

  async function replace(move: Replacing, target: URL): Promise<void> {
    if (move.stepsBack > 0) {
      await passThrough(move.stepsBack);
    }
    await replaceWith(target);
  }

  async function move(planned: Promise<void>): Promise<void> {
    isMoving = true;
    try {
      await planned;
    } finally {
      isMoving = false;
    }
  }

  beforeNavigate(({ type, to, cancel }) => {
    if (type !== "link" || to === null || to.route.id === null) {
      return;
    }
    if (isMoving) {
      cancel();
      return;
    }
    const planned = moveTo(entries, to.url.pathname);
    switch (planned.kind) {
      case "push":
        return;
      case "back":
        cancel();
        void move(goBack(planned.steps));
        return;
      case "replace":
        cancel();
        void move(replace(planned, to.url));
        return;
      default:
        assertNever(planned);
    }
  });

  onNavigate(record);

  afterNavigate((navigation) => {
    if (navigation.type === "enter") {
      record(navigation);
    }
    settle?.();
    settle = undefined;
  });

  return {
    get isPassingThrough() {
      return isPassingThrough;
    },
    replaceWith,
  };
}

export const [getBackGoesUp, setBackGoesUp] = createContext<BackGoesUp>();

function assertNever(value: never): never {
  throw new Error(`unexpected history move ${JSON.stringify(value)}`);
}
