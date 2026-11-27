import { createContext } from "svelte";

import {
  afterNavigate,
  beforeNavigate,
  onNavigate,
  type AfterNavigate,
} from "$app/navigation";
import { page } from "$app/state";
import type { ResolvedPathname } from "$app/types";
import { reportFailure } from "#lib/errors/report-failure.ts";

import { resolvedPathOf } from "./app-path";
import {
  navigateAcrossOverlays,
  navigateTo,
  navigationStartedTo,
} from "./navigate-to";
import { giveBackOverlayEntries, mustLeaveOverlays } from "./overlay-back";
import { isInAppShell } from "./sections";
import { type HistoryMove, moveTo } from "./up-history";

/** How long to wait for a step back to produce a popstate at all before looking where the browser is; a step SvelteKit will ignore is told from its popstate at once. */
export const STEP_BACK_SILENCE_MS = 500;

export interface BackGuardEnvironment {
  readonly beforeNavigate: typeof beforeNavigate;
  readonly afterNavigate: typeof afterNavigate;
  readonly onNavigate: typeof onNavigate;
  readonly goto: (
    target: string,
    options?: { readonly replace?: boolean },
  ) => Promise<unknown>;
  readonly gotoAcrossOverlays: (
    target: string,
    options?: { readonly replace?: boolean },
  ) => Promise<unknown>;
  readonly isReplacing: (target: URL) => boolean;
  readonly stepBackBy: (steps: number) => void;
  readonly onStepBack: (run: () => void) => () => void;
  readonly historyState: () => string;
  readonly browserAt: () => URL;
  readonly pageAt: () => URL;
  readonly after: (ms: number, run: () => void) => () => void;
  readonly mustLeaveOverlays: () => boolean;
  readonly leaveOverlays: () => Promise<void>;
}

const BROWSER: BackGuardEnvironment = {
  beforeNavigate,
  afterNavigate,
  onNavigate,
  goto: navigateTo,
  gotoAcrossOverlays: navigateAcrossOverlays,
  isReplacing: (target) =>
    navigationStartedTo(target)?.options?.replace === true,
  stepBackBy: (steps) => {
    history.go(-steps);
  },
  onStepBack: (run) => {
    addEventListener("popstate", run);
    return () => {
      removeEventListener("popstate", run);
    };
  },
  historyState: () => JSON.stringify(history.state),
  browserAt: () => new URL(location.href),
  pageAt: () => new URL(page.url.href),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => {
      clearTimeout(timer);
    };
  },
  mustLeaveOverlays,
  leaveOverlays: giveBackOverlayEntries,
};

type Replacing = Extract<HistoryMove, { kind: "replace" }>;

export interface BackGoesUp {
  readonly isPassingThrough: boolean;
  readonly isMoving: boolean;
  readonly entries: readonly string[];
  replaceWith(target: ResolvedPathname): Promise<void>;
  followLinkTo(target: ResolvedPathname): Promise<void>;
}

export function makeBackGoUp(env: BackGuardEnvironment = BROWSER): BackGoesUp {
  let entries: readonly string[] = [];
  let isMoving = false;
  let isPassingThrough = false;
  let settle: (() => void) | undefined;
  let followedWhileMoving: URL | undefined;
  let savedState = env.historyState();
  let didRecover = false;

  function record(navigation: AfterNavigate): void {
    const pathname = navigation.to?.url.pathname;
    if (pathname === undefined) {
      return;
    }
    if (navigation.type === "enter") {
      entries = [pathname];
    } else if (navigation.type === "popstate" && navigation.delta < 0) {
      entries = entries.slice(0, navigation.delta);
    } else if (env.isReplacing(navigation.to.url)) {
      entries = [...entries.slice(0, -1), pathname];
    } else if (entries.at(-1) !== pathname) {
      entries = [...entries, pathname];
    }
  }

  async function recoverFromTraversal(steps: number): Promise<void> {
    const here = env.browserAt();
    entries =
      entries.at(-1 - steps) === here.pathname
        ? entries.slice(0, entries.length - steps)
        : [here.pathname];
    didRecover = true;
    if (env.pageAt().pathname !== here.pathname) {
      await replaceWith(resolvedPathOf(here), env.gotoAcrossOverlays);
    }
  }

  function goBack(steps: number): Promise<void> {
    return new Promise((arrived) => {
      let stopWaiting = (): void => undefined;
      let stopListening = (): void => undefined;
      const recover = (): void => {
        stopWaiting();
        stopListening();
        settle = undefined;
        recoverFromTraversal(steps).then(arrived, (error: unknown) => {
          arrived();
          reportFailure(error);
        });
      };
      stopWaiting = env.after(STEP_BACK_SILENCE_MS, recover);
      stopListening = env.onStepBack(() => {
        stopWaiting();
        stopListening();
        if (env.historyState() === savedState) {
          recover();
        }
      });
      settle = () => {
        stopWaiting();
        stopListening();
        arrived();
      };
      env.stepBackBy(steps);
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

  async function replaceWith(
    target: ResolvedPathname,
    go: BackGuardEnvironment["goto"] = env.goto,
  ): Promise<void> {
    await go(target, { replace: true });
  }

  async function replace(
    move: Replacing,
    target: ResolvedPathname,
  ): Promise<void> {
    if (move.stepsBack > 0) {
      await passThrough(move.stepsBack);
    }
    await replaceWith(target);
  }

  async function move(planned: Promise<void>): Promise<void> {
    isMoving = true;
    let next: URL | undefined;
    try {
      await planned;
    } finally {
      isMoving = false;
      next = followedWhileMoving;
      followedWhileMoving = undefined;
    }
    if (next !== undefined && next.href !== env.browserAt().href) {
      await follow(moveTo(entries, next.pathname), next);
    }
  }

  async function reachAfterRecovering(target: URL): Promise<void> {
    if (!didRecover) {
      return;
    }
    didRecover = false;
    if (env.pageAt().pathname !== target.pathname) {
      await follow(moveTo(entries, target.pathname), target, false);
    }
  }

  async function follow(
    planned: HistoryMove,
    target: URL,
    canRetry = true,
  ): Promise<void> {
    const path = resolvedPathOf(target);
    switch (planned.kind) {
      case "push":
        await env.goto(path);
        return;
      case "back":
        await move(goBack(planned.steps));
        break;
      case "replace":
        await move(replace(planned, path));
        break;
      default:
        assertNever(planned);
    }
    if (canRetry) {
      await reachAfterRecovering(target);
    }
  }

  async function leaveOverlays(): Promise<void> {
    isPassingThrough = true;
    try {
      await env.leaveOverlays();
    } finally {
      isPassingThrough = false;
    }
  }

  function followOrQueue(target: URL): Promise<void> {
    if (isMoving) {
      followedWhileMoving = target;
      return Promise.resolve();
    }
    return follow(moveTo(entries, target.pathname), target);
  }

  function followLinkTo(target: ResolvedPathname): Promise<void> {
    return followOrQueue(new URL(target, env.browserAt()));
  }

  env.beforeNavigate(({ type, from, to, cancel, complete }) => {
    if (type === "popstate") {
      const done = (): void => {
        settle?.();
        settle = undefined;
      };
      complete.then(done, done);
      return;
    }
    if (
      type !== "link" ||
      to === null ||
      to.route.id === null ||
      !isInAppShell(to.route.id)
    ) {
      return;
    }
    if (isMoving) {
      cancel();
      void followOrQueue(to.url);
      return;
    }
    if (from?.url.pathname !== to.url.pathname && env.mustLeaveOverlays()) {
      cancel();
      followedWhileMoving = to.url;
      void move(leaveOverlays());
      return;
    }
    const planned = moveTo(entries, to.url.pathname);
    if (planned.kind === "push") {
      return;
    }
    cancel();
    void follow(planned, to.url);
  });

  env.onNavigate(record);

  env.afterNavigate((navigation) => {
    if (navigation.type === "enter") {
      record(navigation);
    }
    savedState = env.historyState();
    settle?.();
    settle = undefined;
  });

  return {
    get isPassingThrough() {
      return isPassingThrough;
    },
    get isMoving() {
      return isMoving;
    },
    get entries() {
      return entries;
    },
    replaceWith,
    followLinkTo,
  };
}

export const [getBackGoesUp, setBackGoesUp] = createContext<BackGoesUp>();

function assertNever(value: never): never {
  throw new Error(`unexpected history move ${JSON.stringify(value)}`);
}
