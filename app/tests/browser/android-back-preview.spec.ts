import type { BackSwipe } from "../../src/lib/ipc/bindings.ts";
import type { FakeChannel } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, fakeAppInfo, test } from "./fixtures.ts";

let gestures: FakeChannel<BackSwipe> | undefined;

test.use({
  platform: "android",
  backend: {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo("android"),
    watchBackSwipes: (channel) => {
      gestures = channel;
      return null;
    },
  },
});

test.beforeEach(() => {
  gestures = undefined;
});

async function gesture(step: BackSwipe): Promise<void> {
  await expect.poll(() => gestures).toBeDefined();
  await gestures?.send(step);
}

test("shrinks the screen and rounds its corners as the back gesture moves, and puts it back when cancelled", async ({
  page,
}) => {
  await page.goto("/settings/privacy");
  const screen = page.getByRole("main");

  await gesture({ kind: "moved", progress: 1 });

  await expect(screen).toHaveCSS("transform", "matrix(0.9, 0, 0, 0.9, 0, 0)");
  await expect(screen).toHaveCSS("border-top-left-radius", "28px");

  await gesture({ kind: "cancelled" });

  await expect(screen).toHaveCSS("transform", "none");
  await expect(screen).toHaveCSS("border-top-left-radius", "0px");
});

test("leaves the screen alone when reduced motion is on", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings/privacy");

  await gesture({ kind: "moved", progress: 1 });

  await expect(page.getByRole("main")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
});
