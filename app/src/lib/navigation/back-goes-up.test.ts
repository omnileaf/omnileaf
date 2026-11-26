import type { AfterNavigate, BeforeNavigate } from "$app/navigation";
import { expect, test } from "vitest";

import {
  type BackGuardEnvironment,
  makeBackGoUp,
  STEP_BACK_SILENCE_MS,
} from "./back-goes-up";

type Registered<T> = (navigation: T) => void;

interface Entry {
  path: string;
  state: string;
}

interface Overlays {
  holds: boolean;
  leave: () => Promise<void>;
}

const SLOW_NAVIGATION_MS = 2000;

class FakeBrowser {
  #entries: Entry[] = [{ path: "/", state: "s0" }];
  #at = 0;
  #shown = "/";
  #states = 0;
  #now = 0;
  #timers: { due: number; run: () => void; isCancelled: boolean }[] = [];
  #after: Registered<AfterNavigate>[] = [];
  #on: Registered<AfterNavigate>[] = [];
  #before: Registered<BeforeNavigate>[] = [];
  #popstates: (() => void)[] = [];
  readonly gone: string[] = [];
  readonly acrossOverlays: string[] = [];
  readonly cancelled: string[] = [];
  ignoredLandings = 0;
  slowNavigations = false;
  losesStepsBack = false;
  readonly overlays: Overlays = {
    holds: false,
    leave: () => Promise.resolve(),
  };

  readonly environment: BackGuardEnvironment = {
    beforeNavigate: (run: Registered<BeforeNavigate>) => {
      this.#before.push(run);
    },
    afterNavigate: (run: Registered<AfterNavigate>) => {
      this.#after.push(run);
    },
    onNavigate: ((run: Registered<AfterNavigate>) => {
      this.#on.push(run);
    }) as BackGuardEnvironment["onNavigate"],
    goto: (target, options) => this.#goto(target, options, false),
    gotoAcrossOverlays: (target, options) => this.#goto(target, options, true),
    stepBackBy: (steps) => {
      this.#stepBack(steps);
    },
    onStepBack: (run) => {
      this.#popstates.push(run);
      return () => {
        this.#popstates = this.#popstates.filter((one) => one !== run);
      };
    },
    historyState: () => this.#entries[this.#at]?.state ?? "",
    browserAt: () =>
      new URL(`https://app.test${this.#entries[this.#at]?.path ?? "/"}`),
    pageAt: () => new URL(`https://app.test${this.#shown}`),
    after: (ms, run) => {
      const timer = { due: this.#now + ms, run, isCancelled: false };
      this.#timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    mustLeaveOverlays: () => this.overlays.holds,
    leaveOverlays: () => this.overlays.leave(),
  };

  get timersPending(): number {
    return this.#timers.filter((timer) => !timer.isCancelled).length;
  }

  enter(): void {
    this.#notify("enter", "/");
  }

  open(path: string): void {
    this.#arrive(path, "push");
  }

  showsPage(path: string): void {
    this.#shown = path;
  }

  copyEntry(): void {
    const current = this.#entries[this.#at];
    if (current === undefined) {
      return;
    }
    this.#entries = [...this.#entries.slice(0, this.#at + 1), { ...current }];
    this.#at += 1;
  }

  click(path: string): void {
    const cancelled = { isCancelled: false };
    for (const run of this.#before) {
      run({
        type: "link",
        from: { url: this.environment.pageAt() },
        to: {
          url: new URL(`https://app.test${path}`),
          route: { id: path === "/" ? "/(app)" : `/(app)${path}` },
        },
        cancel: () => {
          cancelled.isCancelled = true;
          this.cancelled.push(path);
        },
        complete: Promise.resolve(),
      } as unknown as BeforeNavigate);
    }
    if (!cancelled.isCancelled) {
      this.#arrive(path, "push");
    }
  }

  pass(ms: number): void {
    this.#now += ms;
    for (const timer of this.#timers) {
      if (!timer.isCancelled && timer.due <= this.#now) {
        timer.isCancelled = true;
        timer.run();
      }
    }
  }

  #goto(
    target: string,
    options: { readonly replace?: boolean } | undefined,
    isAcrossOverlays: boolean,
  ): Promise<void> {
    if (isAcrossOverlays) {
      this.acrossOverlays.push(target);
    }
    this.gone.push(`${options?.replace === true ? "replace " : ""}${target}`);
    this.#arrive(target, options?.replace === true ? "replace" : "push");
    return Promise.resolve();
  }

  #arrive(path: string, how: "push" | "replace"): void {
    this.#states += 1;
    const entry = { path, state: `s${String(this.#states)}` };
    if (how === "push") {
      this.#entries = [...this.#entries.slice(0, this.#at + 1), entry];
      this.#at += 1;
    } else {
      this.#entries[this.#at] = entry;
    }
    this.#shown = path;
    this.#notify("goto", path);
  }

  #stepBack(steps: number): void {
    if (this.losesStepsBack) {
      return;
    }
    const savedState = this.#entries[this.#at]?.state;
    this.#at -= steps;
    const landed = this.#entries[this.#at];
    if (landed === undefined) {
      return;
    }
    const isIgnored = landed.state === savedState;
    for (const run of this.#popstates) {
      run();
    }
    if (isIgnored) {
      this.ignoredLandings += 1;
      return;
    }
    const completes = this.slowNavigations
      ? new Promise<void>((resolve) => {
          this.#timers.push({
            due: this.#now + SLOW_NAVIGATION_MS,
            run: () => {
              this.#shown = landed.path;
              this.#notify("popstate", landed.path, -steps);
              resolve();
            },
            isCancelled: false,
          });
        })
      : Promise.resolve();
    for (const run of this.#before) {
      run({
        type: "popstate",
        complete: completes,
        cancel: () => undefined,
      } as unknown as BeforeNavigate);
    }
    if (!this.slowNavigations) {
      this.#shown = landed.path;
      this.#notify("popstate", landed.path, -steps);
    }
  }

  #notify(type: string, path: string, delta = 0): void {
    const navigation = {
      type,
      delta,
      to: { url: new URL(`https://app.test${path}`) },
    } as unknown as AfterNavigate;
    for (const run of this.#on) {
      run(navigation);
    }
    for (const run of this.#after) {
      run(navigation);
    }
  }
}

async function ticks(count = 40): Promise<void> {
  for (let tick = 0; tick < count; tick += 1) {
    await Promise.resolve();
  }
}

function guarded() {
  const browser = new FakeBrowser();
  const guard = makeBackGoUp(browser.environment);
  browser.enter();
  return { browser, guard };
}

test("recovers at once from a step back onto an entry SvelteKit ignores, with no timer needed", async () => {
  const { browser, guard } = guarded();
  browser.open("/history");
  browser.copyEntry();

  void guard.followLinkTo("/");
  await ticks();

  expect(browser.ignoredLandings).toBe(1);
  expect(browser.gone).toContain("replace /");
  expect(browser.timersPending).toBe(0);
});

test("carries a link out after recovering, though the step back it planned was ignored", async () => {
  const { browser, guard } = guarded();
  browser.open("/history");
  browser.open("/series/1");
  browser.copyEntry();
  const settled = { isDone: false };

  void guard.followLinkTo("/history").then(() => {
    settled.isDone = true;
  });
  browser.click("/settings");
  await ticks();

  expect(settled.isDone).toBe(true);
  expect(browser.gone.some((target) => target.includes("/settings"))).toBe(
    true,
  );
});

test("rebuilds the guard's entries from where the browser is when it landed elsewhere", async () => {
  const { browser, guard } = guarded();
  browser.open("/history");
  browser.open("/series/1");
  browser.copyEntry();

  void guard.followLinkTo("/history");
  await ticks();

  expect(guard.entries.at(-1)).not.toBe("/series/1");
  expect(guard.entries.length).toBeLessThanOrEqual(2);
});

test("does not recover from a step back whose navigation is only slow", async () => {
  const { browser, guard } = guarded();
  browser.open("/history");
  browser.open("/series/1");
  browser.slowNavigations = true;
  const settled = { isDone: false };

  void guard.followLinkTo("/history").then(() => {
    settled.isDone = true;
  });
  browser.pass(STEP_BACK_SILENCE_MS * 2);
  await ticks();
  const whileSlow = [settled.isDone, [...browser.gone]];
  browser.pass(SLOW_NAVIGATION_MS);
  await ticks();

  expect(whileSlow).toEqual([false, []]);
  expect(settled.isDone).toBe(true);
  expect(browser.gone).toEqual([]);
});

test("settles a step back that never produces a popstate, and carries out the link queued behind it", async () => {
  const { browser, guard } = guarded();
  browser.open("/history");
  browser.open("/series/1");
  browser.losesStepsBack = true;

  void guard.followLinkTo("/history");
  browser.click("/settings");
  browser.pass(STEP_BACK_SILENCE_MS);
  await ticks();
  browser.losesStepsBack = false;
  browser.pass(STEP_BACK_SILENCE_MS);
  await ticks();

  expect(browser.gone.some((target) => target.includes("/settings"))).toBe(
    true,
  );
  expect(guard.isPassingThrough).toBe(false);
});

test("lets a step back that arrives in time settle without looking again", async () => {
  const { browser, guard } = guarded();
  browser.open("/history");
  browser.open("/series/1");

  await guard.followLinkTo("/history");
  browser.pass(STEP_BACK_SILENCE_MS);

  expect(browser.gone).toEqual([]);
  expect(guard.entries).toEqual(["/", "/history"]);
});

test("counts as moving while it gives overlays back, queues later links, and follows the last one afterwards", async () => {
  const { browser, guard } = guarded();
  browser.open("/history");
  const givenBack = { finish: (): void => undefined };
  browser.overlays.holds = true;
  browser.overlays.leave = () =>
    new Promise<void>((resolve) => {
      givenBack.finish = resolve;
    });

  browser.click("/settings");
  const whileLeaving = guard.isPassingThrough;
  browser.click("/browse");
  const goneWhileLeaving = [...browser.gone];
  browser.overlays.holds = false;
  givenBack.finish();
  await ticks();

  expect(whileLeaving).toBe(true);
  expect(goneWhileLeaving).toEqual([]);
  expect(browser.cancelled).toEqual(["/settings", "/browse"]);
  expect(browser.gone.some((target) => target.includes("/browse"))).toBe(true);
  expect(browser.gone.some((target) => target.includes("/settings"))).toBe(
    false,
  );
  expect(guard.isPassingThrough).toBe(false);
});

test("follows a link to its target once the overlays have been given back", async () => {
  const { browser } = guarded();
  browser.open("/history");
  browser.overlays.holds = true;

  browser.click("/settings");
  browser.overlays.holds = false;
  await ticks();

  expect(browser.cancelled).toEqual(["/settings"]);
  expect(browser.gone.some((target) => target.includes("/settings"))).toBe(
    true,
  );
});

test("shows the page the browser is on without being held up by an overlay that opened meanwhile", async () => {
  const { browser, guard } = guarded();
  browser.open("/history");
  browser.copyEntry();
  browser.showsPage("/settings");

  void guard.followLinkTo("/");
  await ticks();

  expect(browser.acrossOverlays).toEqual(["/history"]);
});
