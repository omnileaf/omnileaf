import { createContext } from "svelte";

import {
  afterNavigate,
  beforeNavigate,
  goto,
  onNavigate,
  type AfterNavigate,
} from "$app/navigation";
import { page } from "$app/state";
import type { ResolvedPathname } from "$app/types";
import { reportFailure } from "#lib/errors/report-failure.ts";

import { resolvedPathOf } from "./app-path";
import { leaveOverlaysThen, mustLeaveOverlays } from "./overlay-back";
import { isInAppShell } from "./sections";
import { type HistoryMove, moveTo } from "./up-history";

/** How long a step back may take to arrive before the guard looks where the browser really is, since SvelteKit ignores a step back onto an entry with the page's own history index. */
export const TRAVERSAL_SETTLE_MS = 1500;

export interface BackGuardEnvironment {
  readonly beforeNavigate: typeof beforeNavigate;
  readonly afterNavigate: typeof afterNavigate;
  readonly onNavigate: typeof onNavigate;
  readonly goto: (
    target: string,
    options?: { readonly replace?: boolean },
  ) => Promise<unknown>;
  readonly stepBackBy: (steps: number) => void;
  readonly browserAt: () => URL;
  readonly pageAt: () => URL;
  readonly after: (ms: number, run: () => void) => () => void;
  mustLeaveOverlays: () => boolean;
  leaveOverlaysThen: (go: () => Promise<unknown>) => void;
}

const BROWSER: BackGuardEnvironment = {
  beforeNavigate,
  afterNavigate,
  onNavigate,
  goto,
  stepBackBy: (steps) => {
    history.go(-steps);
  },
  browserAt: () => new URL(location.href),
  pageAt: () => page.url,
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => {
      clearTimeout(timer);
    };
  },
  mustLeaveOverlays,
  leaveOverlaysThen,
};

type Replacing = Extract<HistoryMove, { kind: "replace" }>;

export interface BackGoesUp {
  readonly isPassingThrough: boolean;
  readonly entries: readonly string[];
  replaceWith(target: ResolvedPathname): Promise<void>;
  followLinkTo(target: ResolvedPathname): Promise<void>;
}

export function makeBackGoUp(env: BackGuardEnvironment = BROWSER): BackGoesUp {
  let entries: readonly string[] = [];
  let isMoving = false;
  let isPassingThrough = false;
  const replacing = new Set<string>();
  let settle: (() => void) | undefined;
  let followedWhileMoving: URL | undefined;

  function record(navigation: AfterNavigate): void {
    const pathname = navigation.to?.url.pathname;
    if (pathname === undefined) {
      return;
    }
    if (navigation.type === "enter") {
      entries = [pathname];
    } else if (navigation.type === "popstate" && navigation.delta < 0) {
      entries = entries.slice(0, navigation.delta);
    } else if (replacing.has(pathname)) {
      entries = [...entries.slice(0, -1), pathname];
    } else if (entries.at(-1) !== pathname) {
      entries = [...entries, pathname];
    }
  }

  async function recoverFromTraversal(steps: number): Promise<void> {
    const here = env.browserAt();
    if (here.pathname === entries.at(-1 - steps)) {
      entries = entries.slice(0, entries.length - steps);
    }
    if (env.pageAt().pathname !== here.pathname) {
      await env.goto(resolvedPathOf(here), { replace: true });
    }
  }

  function goBack(steps: number): Promise<void> {
    return new Promise((arrived) => {
      const stopWaiting = env.after(TRAVERSAL_SETTLE_MS, () => {
        settle = undefined;
        recoverFromTraversal(steps).then(arrived, (error: unknown) => {
          arrived();
          reportFailure(error);
        });
      });
      settle = () => {
        stopWaiting();
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

  async function replaceWith(target: ResolvedPathname): Promise<void> {
    const { pathname } = new URL(target, env.browserAt());
    replacing.add(pathname);
    try {
      await env.goto(target, { replace: true });
    } finally {
      replacing.delete(pathname);
    }
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

  function follow(planned: HistoryMove, target: URL): Promise<void> {
    const path = resolvedPathOf(target);
    switch (planned.kind) {
      case "push":
        return env.goto(path).then(() => undefined);
      case "back":
        return move(goBack(planned.steps));
      case "replace":
        return move(replace(planned, path));
      default:
        return assertNever(planned);
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

  env.beforeNavigate(({ type, from, to, cancel }) => {
    if (
      type !== "link" ||
      to === null ||
      to.route.id === null ||
      !isInAppShell(to.route.id)
    ) {
      return;
    }
    if (from?.url.pathname !== to.url.pathname && env.mustLeaveOverlays()) {
      cancel();
      env.leaveOverlaysThen(() => followOrQueue(to.url));
      return;
    }
    if (isMoving) {
      cancel();
      void followOrQueue(to.url);
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
    settle?.();
    settle = undefined;
  });

  return {
    get isPassingThrough() {
      return isPassingThrough;
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
