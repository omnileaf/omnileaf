import { expect, test } from "vitest";

import { OverlayBack, type PageHistory } from "./overlay-back";

function pageHistory() {
  const listeners = new Set<() => void>();
  const entries = { pushed: 0, backed: 0 };
  const page = { isOnOverlayEntry: true };
  const history: PageHistory = {
    push: () => {
      entries.pushed += 1;
      return () => page.isOnOverlayEntry;
    },
    back: () => {
      entries.backed += 1;
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

function overlayBack(isOn = true) {
  const page = pageHistory();
  const told = { count: 0 };
  const overlays = new OverlayBack(
    page.history,
    () => {
      told.count += 1;
    },
    () => isOn,
  );
  return { overlays, page, told };
}

test("holds one history entry while an overlay is open", () => {
  const { overlays, page, told } = overlayBack();

  overlays.hold(() => undefined);

  expect(page.entries).toEqual({ pushed: 1, backed: 0 });
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

test("gives its entry back when the overlay closes some other way", () => {
  const { overlays, page, told } = overlayBack();
  const release = overlays.hold(() => undefined);

  release();

  expect(page.entries).toEqual({ pushed: 1, backed: 1 });
  expect(told.count).toBe(2);
});

test("keeps the page it navigated to when the overlay closes after the navigation", () => {
  const { overlays, page } = overlayBack();
  const release = overlays.hold(() => undefined);

  page.navigateAway();
  release();

  expect(page.entries).toEqual({ pushed: 1, backed: 0 });
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

  expect(page.entries).toEqual({ pushed: 0, backed: 0 });
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

test("holds an entry only while an overlay is open and has not given it back", () => {
  const { overlays, page } = overlayBack();
  const before = overlays.holdsEntries();

  const release = overlays.hold(() => undefined);
  const whileOpen = overlays.holdsEntries();
  void overlays.giveBack();
  const afterGivingBack = overlays.holdsEntries();
  page.goBack();
  release();

  expect([before, whileOpen, afterGivingBack]).toEqual([false, true, false]);
});

test("holds no entry when the page does not follow history for back", () => {
  const { overlays } = overlayBack(false);

  overlays.hold(() => undefined);

  expect(overlays.holdsEntries()).toBe(false);
});

test("holds a new entry only once its own step back for the last overlay has landed", () => {
  const { overlays, page } = overlayBack();
  let closed = 0;
  const releaseSheet = overlays.hold(() => undefined);
  releaseSheet();

  overlays.hold(() => {
    closed += 1;
  });
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
  expect(page.entries).toEqual({ pushed: 1, backed: 1 });
});
