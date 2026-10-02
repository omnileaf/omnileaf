import type { AfterNavigate } from "@sveltejs/kit";
import type { RouteId } from "$app/types";

import { afterNavigate, beforeNavigate, goto } from "$app/navigation";
import { resolve } from "$app/paths";

import { type HistoryMove, moveTo } from "./up-history";

type Replacing = Extract<HistoryMove, { kind: "replace" }>;

/** Shapes the history as links are followed so back goes up a level, as Android's back button should, instead of retracing every page. */
export function makeBackGoUp(): void {
  let entries: readonly string[] = [];
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

  async function replace(move: Replacing, route: RouteId): Promise<void> {
    if (move.stepsBack > 0) {
      await goBack(move.stepsBack);
    }
    isReplacing = true;
    try {
      await goto(resolve(route), { replaceState: true });
    } finally {
      isReplacing = false;
    }
  }

  beforeNavigate(({ type, to, cancel }) => {
    const route = to?.route.id;
    if (type !== "link" || to === null || route == null) {
      return;
    }
    const move = moveTo(entries, to.url.pathname);
    switch (move.kind) {
      case "push":
        return;
      case "back":
        cancel();
        void goBack(move.steps);
        return;
      case "replace":
        cancel();
        void replace(move, route);
        return;
      default:
        assertNever(move);
    }
  });

  afterNavigate((navigation) => {
    record(navigation);
    settle?.();
    settle = undefined;
  });
}

function assertNever(value: never): never {
  throw new Error(`unexpected history move ${JSON.stringify(value)}`);
}
