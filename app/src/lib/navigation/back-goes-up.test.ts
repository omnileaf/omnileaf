import type { AfterNavigate, BeforeNavigate } from "$app/navigation";
import { expect, test } from "vitest";

import {
  type BackGuardEnvironment,
  makeBackGoUp,
  TRAVERSAL_SETTLE_MS,
} from "./back-goes-up";

type Registered<T> = (navigation: T) => void;

interface Entry {
  readonly path: string;
  readonly index: number;
}

class FakeBrowser {
  #entries: Entry[] = [{ path: "/", index: 0 }];
  #at = 0;
  #shown = "/";
  #now = 0;
  #timers: { due: number; run: () => void; isCancelled: boolean }[] = [];
  #after: Registered<AfterNavigate>[] = [];
  #on: Registered<AfterNavigate>[] = [];
  #before: Registered<BeforeNavigate>[] = [];
  readonly gone: string[] = [];
  readonly stepsBack: number[] = [];
  ignoresIndexes = new Set<number>();
  losesStepsBack = false;

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
    goto: (target, options) => {
      this.gone.push(`${options?.replace === true ? "replace " : ""}${target}`);
      this.#arrive(target, options?.replace === true ? "replace" : "push");
      return Promise.resolve();
    },
    stepBackBy: (steps) => {
      this.stepsBack.push(steps);
      this.#stepBack(steps);
    },
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
    mustLeaveOverlays: () => false,
    leaveOverlaysThen: () => undefined,
  };

  enter(): void {
    this.#notify("enter", "/", 0);
  }

  open(path: string): void {
    this.#arrive(path, "push");
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
        },
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

  #arrive(path: string, how: "push" | "replace"): void {
    const index =
      (this.#entries[this.#at]?.index ?? 0) + (how === "push" ? 1 : 0);
    if (how === "push") {
      this.#entries = [
        ...this.#entries.slice(0, this.#at + 1),
        { path, index },
      ];
      this.#at += 1;
    } else {
      this.#entries[this.#at] = { path, index };
    }
    this.#shown = path;
    this.#notify("goto", path, index);
  }

  #stepBack(steps: number): void {
    if (this.losesStepsBack) {
      return;
    }
    const from = this.#entries[this.#at];
    this.#at -= steps;
    const landed = this.#entries[this.#at];
    if (landed === undefined || from === undefined) {
      return;
    }
    if (this.ignoresIndexes.has(landed.index) || landed.index === from.index) {
      return;
    }
    this.#shown = landed.path;
    this.#notify("popstate", landed.path, landed.index, -steps);
  }

  #notify(type: string, path: string, _index: number, delta = 0): void {
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

async function waitOutTraversals(browser: FakeBrowser): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    browser.pass(TRAVERSAL_SETTLE_MS);
    for (let tick = 0; tick < 6; tick += 1) {
      await Promise.resolve();
    }
  }
}

function guarded() {
  const browser = new FakeBrowser();
  const guard = makeBackGoUp(browser.environment);
  browser.enter();
  return { browser, guard };
}

test("settles a step back whose arrival SvelteKit ignores, and carries out the link queued behind it", async () => {
  const { browser, guard } = guarded();
  browser.open("/history");
  browser.open("/series/1");
  browser.ignoresIndexes.add(1);
  const settled = { isDone: false };

  void guard.followLinkTo("/history").then(() => {
    settled.isDone = true;
  });
  browser.click("/settings");
  const whileWaiting = settled.isDone;
  await waitOutTraversals(browser);

  expect(whileWaiting).toBe(false);
  expect(settled.isDone).toBe(true);
  expect(browser.gone.some((target) => target.includes("/settings"))).toBe(
    true,
  );
});

test("looks where the browser really is when a step back is ignored, and shows that page", async () => {
  const { browser, guard } = guarded();
  browser.open("/history");
  browser.open("/series/1");
  browser.ignoresIndexes.add(1);

  void guard.followLinkTo("/history");
  await waitOutTraversals(browser);

  expect(browser.gone).toContain("replace /history");
  expect(guard.entries.at(-1)).toBe("/history");
});

test("settles a step back that never arrives and leaves later links unqueued", async () => {
  const { browser, guard } = guarded();
  browser.open("/history");
  browser.open("/series/1");
  browser.losesStepsBack = true;

  void guard.followLinkTo("/history");
  browser.click("/settings");
  await waitOutTraversals(browser);
  browser.losesStepsBack = false;
  browser.click("/browse");
  await waitOutTraversals(browser);

  expect(browser.gone.some((target) => target.includes("/settings"))).toBe(
    true,
  );
  expect(guard.isPassingThrough).toBe(false);
  expect(browser.gone.at(-1)).toContain("/browse");
});

test("lets a step back that arrives in time settle without looking again", async () => {
  const { browser, guard } = guarded();
  browser.open("/history");
  browser.open("/series/1");

  await guard.followLinkTo("/history");
  browser.pass(TRAVERSAL_SETTLE_MS);

  expect(browser.gone).toEqual([]);
  expect(guard.entries).toEqual(["/", "/history"]);
});

test("leaves the overlays' entries first for a link into the app's tabs", () => {
  const { browser } = guarded();
  const left: string[] = [];
  browser.environment.mustLeaveOverlays = () => true;
  browser.environment.leaveOverlaysThen = (go) => {
    left.push("left");
    void go();
  };

  browser.click("/settings");

  expect(left).toEqual(["left"]);
});
