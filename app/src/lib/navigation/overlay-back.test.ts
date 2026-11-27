import { expect, test } from "vitest";

import {
  type AfterDelay,
  closesOnBackIn,
  GIVE_BACK_SETTLES_MS,
  mustLeaveOverlaysBefore,
  optionsToCarry,
  OverlayBack,
  type PageHistory,
  type PageNavigation,
} from "./overlay-back";

function pageHistory() {
  const listeners = new Set<() => void>();
  const entries = { pushed: 0, backed: 0, steps: [] as number[] };
  const page = { isOnOverlayEntry: true };
  const history: PageHistory = {
    push: () => {
      entries.pushed += 1;
      return () => page.isOnOverlayEntry;
    },
    back: (steps) => {
      entries.backed += steps;
      entries.steps.push(steps);
    },
    onBack: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    history,
    entries,
    navigateAway: () => {
      page.isOnOverlayEntry = false;
    },
    listening: () => listeners.size,
    goBack: () => {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function fakeDelays() {
  const timers: { due: number; run: () => void; isCancelled: boolean }[] = [];
  const clock = { now: 0 };
  return {
    after: (ms: number, run: () => void) => {
      const timer = { due: clock.now + ms, run, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    pass: (ms: number) => {
      clock.now += ms;
      for (const timer of timers) {
        if (!timer.isCancelled && timer.due <= clock.now) {
          timer.isCancelled = true;
          timer.run();
        }
      }
    },
  };
}

function overlayBack(isOn = true, after?: AfterDelay) {
  const page = pageHistory();
  const told = { count: 0 };
  const overlays = new OverlayBack(
    page.history,
    () => {
      told.count += 1;
    },
    () => isOn,
    after,
  );
  return { overlays, page, told };
}

test("holds one history entry while an overlay is open", () => {
  const { overlays, page, told } = overlayBack();

  overlays.hold(() => undefined);

  expect(page.entries).toMatchObject({ pushed: 1, backed: 0 });
  expect(told.count).toBe(1);
});

test("closes the overlay when the page goes back, and gives no entry back", () => {
  const { overlays, page } = overlayBack();
  let closed = 0;
  const release = overlays.hold(() => {
    closed += 1;
  });

  page.goBack();
  release();

  expect(closed).toBe(1);
  expect(page.entries.backed).toBe(0);
  expect(page.listening()).toBe(0);
});

test("gives its entry back when the overlay closes some other way", async () => {
  const { overlays, page, told } = overlayBack();
  const release = overlays.hold(() => undefined);

  release();
  await Promise.resolve();

  expect(page.entries).toMatchObject({ pushed: 1, backed: 1 });
  expect(told.count).toBe(2);
});

test("keeps the page it navigated to when the overlay closes after the navigation", () => {
  const { overlays, page } = overlayBack();
  const release = overlays.hold(() => undefined);

  page.navigateAway();
  release();

  expect(page.entries).toMatchObject({ pushed: 1, backed: 0 });
  expect(page.listening()).toBe(0);
});

test("ignores the page going back for its own entry", () => {
  const { overlays, page } = overlayBack();
  let closed = 0;
  overlays.hold(() => {
    closed += 1;
  })();
  const reopened = overlays.hold(() => {
    closed += 1;
  });

  page.goBack();

  expect(closed).toBe(0);
  reopened();
});

test("closes only the overlay opened last", () => {
  const { overlays, page } = overlayBack();
  const closed: string[] = [];
  overlays.hold(() => closed.push("sheet"));
  overlays.hold(() => closed.push("dialog"));

  page.goBack();

  expect(closed).toEqual(["dialog"]);
});

test("holds nothing where the platform does not follow the page's history", () => {
  const { overlays, page, told } = overlayBack(false);

  const release = overlays.hold(() => undefined);
  release();

  expect(page.entries).toMatchObject({ pushed: 0, backed: 0 });
  expect(told.count).toBe(0);
});

test("settles at once when no overlay holds an entry", async () => {
  const { overlays, page } = overlayBack();

  await overlays.giveBack();

  expect(page.entries.backed).toBe(0);
});

test("gives an open overlay's entry back and settles once the page has gone back", async () => {
  const { overlays, page } = overlayBack();
  overlays.hold(() => undefined);
  const settled = { isDone: false };

  const giving = overlays.giveBack().then(() => {
    settled.isDone = true;
  });
  await Promise.resolve();

  expect(page.entries.backed).toBe(1);
  expect(settled.isDone).toBe(false);

  page.goBack();
  await giving;

  expect(settled.isDone).toBe(true);
});

test("gives an entry back only once when its overlay closes afterwards", async () => {
  const { overlays, page } = overlayBack();
  const release = overlays.hold(() => undefined);
  const giving = overlays.giveBack();
  page.goBack();
  await giving;

  release();

  expect(page.entries.backed).toBe(1);
  expect(page.listening()).toBe(0);
});

test("must give back before leaving only while an overlay is open or its entry's step back is on its way", () => {
  const { overlays, page } = overlayBack();
  const before = overlays.mustGiveBackBeforeLeaving();

  const release = overlays.hold(() => undefined);
  const whileOpen = overlays.mustGiveBackBeforeLeaving();
  void overlays.giveBack();
  const whileSteppingBack = overlays.mustGiveBackBeforeLeaving();
  page.goBack();
  const onceLanded = overlays.mustGiveBackBeforeLeaving();
  release();

  expect([before, whileOpen, whileSteppingBack, onceLanded]).toEqual([
    false,
    true,
    true,
    false,
  ]);
});

test("never must give back when the page does not follow history for back", () => {
  const { overlays } = overlayBack(false);

  overlays.hold(() => undefined);

  expect(overlays.mustGiveBackBeforeLeaving()).toBe(false);
});

test("must give back before leaving while its own step back is on its way and an overlay waits for its entry", () => {
  const { overlays } = overlayBack();
  const releaseSheet = overlays.hold(() => undefined);
  releaseSheet();

  overlays.hold(() => undefined);

  expect(overlays.mustGiveBackBeforeLeaving()).toBe(true);
});

test("holds a new entry only once its own step back for the last overlay has landed", async () => {
  const { overlays, page } = overlayBack();
  let closed = 0;
  const releaseSheet = overlays.hold(() => undefined);
  releaseSheet();

  overlays.hold(() => {
    closed += 1;
  });
  await Promise.resolve();
  const pushedWhileStepping = page.entries.pushed;
  page.goBack();
  const pushedOnceLanded = page.entries.pushed;
  page.goBack();

  expect([pushedWhileStepping, pushedOnceLanded]).toEqual([1, 2]);
  expect(closed).toBe(1);
});

test("settles a give-back once its last step back lands, never pushing the overlay that waited for an entry", async () => {
  const { overlays, page } = overlayBack();
  const releaseSheet = overlays.hold(() => undefined);
  releaseSheet();
  overlays.hold(() => undefined);
  const settled = { isDone: false };

  const giving = overlays.giveBack().then(() => {
    settled.isDone = true;
  });
  await Promise.resolve();
  const settledBeforeLanding = settled.isDone;
  page.goBack();
  await giving;

  expect(settledBeforeLanding).toBe(false);
  expect(page.entries).toMatchObject({ pushed: 1, backed: 1 });
});

test("will take back only while an overlay's entry is open and not yet gone back to", () => {
  const { overlays, page } = overlayBack();
  const before = overlays.willTakeBack();

  const release = overlays.hold(() => undefined);
  const whileOpen = overlays.willTakeBack();
  page.goBack();
  const onceBackedTo = overlays.willTakeBack();
  release();

  expect([before, whileOpen, onceBackedTo]).toEqual([false, true, false]);
});

test("will not take back once its overlay closes some other way", () => {
  const { overlays } = overlayBack();
  const release = overlays.hold(() => undefined);

  release();

  expect(overlays.willTakeBack()).toBe(false);
});

test("will not take back once the page has navigated away from the overlay's entry", () => {
  const { overlays, page } = overlayBack();
  overlays.hold(() => undefined);

  page.navigateAway();

  expect(overlays.willTakeBack()).toBe(false);
});

test("never will take back when the page does not follow history for back", () => {
  const { overlays } = overlayBack(false);

  overlays.hold(() => undefined);

  expect(overlays.willTakeBack()).toBe(false);
});

const SERIES_ROUTE = "/(app)/series/[id]";
const SETTINGS_ROUTE = "/(app)/settings";

function navigation(
  type: PageNavigation["type"],
  toPath: string,
  routeId: string | null = SERIES_ROUTE,
): PageNavigation {
  return {
    type,
    from: { url: new URL("https://app.test/history") },
    to: { url: new URL(`https://app.test${toPath}`), route: { id: routeId } },
  };
}

function holding(isHolding: boolean) {
  const { overlays } = overlayBack();
  if (isHolding) {
    overlays.hold(() => undefined);
  }
  return overlays;
}

test("must leave an overlay's entry before a program navigates to another page", () => {
  expect(
    mustLeaveOverlaysBefore(navigation("goto", "/series/1"), holding(true)),
  ).toBe(true);
});

test("must leave an overlay's entry before a link to a page outside the app's tabs", () => {
  expect(
    mustLeaveOverlaysBefore(
      navigation("link", "/read/1", "/read/[book]"),
      holding(true),
    ),
  ).toBe(true);
});

test("must leave an overlay's entry before a form leaves the page", () => {
  expect(
    mustLeaveOverlaysBefore(navigation("form", "/search"), holding(true)),
  ).toBe(true);
});

test("leaves a link into the app's tabs to the guard that plans the history", () => {
  expect(
    mustLeaveOverlaysBefore(
      navigation("link", "/settings", SETTINGS_ROUTE),
      holding(true),
    ),
  ).toBe(false);
});

test("leaves an overlay's entry alone when the page stays the same", () => {
  expect(
    mustLeaveOverlaysBefore(
      navigation("goto", "/history?q=blue"),
      holding(true),
    ),
  ).toBe(false);
});

test("leaves an overlay's entry alone for a step in the history", () => {
  expect(
    mustLeaveOverlaysBefore(navigation("popstate", "/"), holding(true)),
  ).toBe(false);
});

test("leaves a navigation alone when no overlay holds an entry", () => {
  expect(
    mustLeaveOverlaysBefore(navigation("goto", "/series/1"), holding(false)),
  ).toBe(false);
});

test("gives the entries of overlays that close together back with one step", async () => {
  const { overlays, page } = overlayBack();
  const releaseSheet = overlays.hold(() => undefined);
  const releaseMenu = overlays.hold(() => undefined);

  releaseMenu();
  releaseSheet();
  await Promise.resolve();

  expect(page.entries.steps).toEqual([2]);
});

test("gives every held entry back with one step when the page leaves", async () => {
  const { overlays, page } = overlayBack();
  overlays.hold(() => undefined);
  overlays.hold(() => undefined);
  const settled = { isDone: false };

  const giving = overlays.giveBack().then(() => {
    settled.isDone = true;
  });
  page.goBack();
  await giving;

  expect(page.entries.steps).toEqual([2]);
  expect(settled.isDone).toBe(true);
});

test("settles a give-back whose step never lands, and lets the page navigate", async () => {
  const delays = fakeDelays();
  const { overlays } = overlayBack(true, delays.after);
  overlays.hold(() => undefined);
  const settled = { isDone: false };
  const giving = overlays.giveBack().then(() => {
    settled.isDone = true;
  });

  const before = overlays.mustGiveBackBeforeLeaving();
  delays.pass(GIVE_BACK_SETTLES_MS);
  await giving;

  expect(before).toBe(true);
  expect(settled.isDone).toBe(true);
  expect(overlays.mustGiveBackBeforeLeaving()).toBe(false);
});

const STARTED_ACROSS = {
  href: "https://app.test/series/1",
  options: undefined,
  isAcrossOverlays: true,
};

test("leaves a navigation that was started to go across overlays alone", () => {
  expect(
    mustLeaveOverlaysBefore(
      navigation("goto", "/series/1"),
      holding(true),
      STARTED_ACROSS,
    ),
  ).toBe(false);
});

test("carries a goto's own options to the navigation that follows its give-back", () => {
  const started = {
    href: "https://app.test/",
    options: { state: { libraryTag: "Sea" } },
    isAcrossOverlays: false,
  };

  expect(optionsToCarry(navigation("goto", "/"), started)).toEqual({
    state: { libraryTag: "Sea" },
  });
});

test("carries a link's own attributes to the navigation that follows its give-back", () => {
  const link = document.createElement("a");
  link.setAttribute("data-sveltekit-replacestate", "");
  const event = new MouseEvent("click");
  link.dispatchEvent(event);

  expect(
    optionsToCarry({ ...navigation("link", "/series/1"), event }, undefined),
  ).toEqual({ replace: true });
});

test("carries no options for a form", () => {
  expect(
    optionsToCarry(navigation("form", "/search"), undefined),
  ).toBeUndefined();
});

test("must leave a closed overlay's entry before a navigation, and gives it back once, though the navigation comes before the step back is made", async () => {
  const { overlays, page } = overlayBack();
  const release = overlays.hold(() => undefined);
  release();

  const mustLeave = mustLeaveOverlaysBefore(
    navigation("goto", "/series/1"),
    overlays,
  );
  const giving = overlays.giveBack();
  await Promise.resolve();
  page.goBack();
  await giving;

  expect(mustLeave).toBe(true);
  expect(page.entries.steps).toEqual([1]);
});

async function settle(): Promise<void> {
  for (let tick = 0; tick < 10; tick += 1) {
    await Promise.resolve();
  }
}

function openedOverlay() {
  const { overlays, page } = overlayBack();
  const element = document.createElement("div");
  element.dataset["state"] = "open";
  element.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      element.dataset["state"] = "closed";
    }
  });
  const detach = closesOnBackIn(overlays)(element);
  return {
    overlays,
    page,
    element,
    detach: () => {
      detach?.();
    },
    startClosing: () => {
      element.dataset["state"] = "closed";
    },
    reopen: () => {
      element.dataset["state"] = "open";
    },
  };
}

test("gives an overlay's entry back as its closing starts, before it unmounts", async () => {
  const { page, startClosing } = openedOverlay();

  startClosing();
  await settle();

  expect(page.entries.steps).toEqual([1]);
});

test("gives nothing more back when an overlay that started closing unmounts", async () => {
  const { page, startClosing, detach } = openedOverlay();

  startClosing();
  await settle();
  detach();
  await settle();

  expect(page.entries.steps).toEqual([1]);
});

test("gives an overlay's entry back when it unmounts without having closed", async () => {
  const { page, detach } = openedOverlay();

  detach();
  await settle();

  expect(page.entries.steps).toEqual([1]);
});

test("gives no entry back when the page going back is what closes an overlay", async () => {
  const { page } = openedOverlay();

  page.goBack();
  await settle();

  expect(page.entries.steps).toEqual([]);
});

test("takes a new entry for an overlay reopened while it was still closing, once the old one is given back", async () => {
  const { overlays, page, startClosing, reopen } = openedOverlay();

  startClosing();
  await settle();
  reopen();
  await settle();
  const pushedBeforeStepLanded = page.entries.pushed;
  page.goBack();
  await settle();

  expect([pushedBeforeStepLanded, page.entries.pushed]).toEqual([1, 2]);
  expect(overlays.willTakeBack()).toBe(true);
});

test("gives the entry of an overlay reopened while it was closing back again when it closes again", async () => {
  const { page, startClosing, reopen } = openedOverlay();

  startClosing();
  await settle();
  reopen();
  page.goBack();
  await settle();
  startClosing();
  await settle();

  expect(page.entries.steps).toEqual([1, 1]);
});

test("must leave before a navigation the moment an overlay starts closing, and steps back once", async () => {
  const { overlays, page, startClosing } = openedOverlay();

  startClosing();
  await settle();
  const mustLeave = mustLeaveOverlaysBefore(
    navigation("goto", "/series/1"),
    overlays,
  );
  page.goBack();
  await settle();

  expect(mustLeave).toBe(true);
  expect(page.entries.steps).toEqual([1]);
});
