import { setTimeout as delay } from "node:timers/promises";

import type { CDPSession, Locator, Page } from "@playwright/test";

import { commandsAsked, type FakeBackend } from "./fake-backend.ts";
import { boxOf, expect } from "./fixtures.ts";

export interface LibraryFrame {
  readonly at: number;
  readonly isLibraryShown: boolean;
  readonly skeletonTiles: number;
  readonly covers: number;
  readonly hasTabs: boolean;
  readonly chosenTab: string | undefined;
  readonly count: string | undefined;
  readonly sections: number;
  readonly emptyTitle: string | undefined;
  readonly scrollTop: number;
  readonly firstCover: string | undefined;
}

declare global {
  interface Window {
    __omnileafLibraryFrame?: () => LibraryFrame;
    __omnileafLibraryFrames?: LibraryFrame[];
    __omnileafRecordFrames?: () => void;
    __omnileafStopFrames?: () => void;
  }
}

const SHORTEST_ANSWER_MS = 50;
const ANSWER_SPREAD_MS = 101;
const CPU_SLOWDOWN = 4;
const QUIET_FRAMES = 20;
const LONGEST_SETTLE_MS = 10_000;
const FINGER_ID = 1;

function answerDelayOf(command: string): number {
  let sum = 0;
  for (const letter of command) {
    sum = (sum * 31 + letter.charCodeAt(0)) % ANSWER_SPREAD_MS;
  }
  return SHORTEST_ANSWER_MS + sum;
}

/** Answers every command after a delay between 50 and 150 ms that stays the same for each command, as the core answers on a phone. */
export function answeringLikeAPhone(backend: FakeBackend): FakeBackend {
  return Object.fromEntries(
    Object.entries(backend).map(([name, answer]) => [
      name,
      typeof answer === "function"
        ? async (...asked: unknown[]) => {
            await delay(answerDelayOf(name));
            return Reflect.apply(answer, undefined, asked) as unknown;
          }
        : answer,
    ]),
  ) as unknown as FakeBackend;
}

function installFrameRecorder(startsAtOnce: boolean): void {
  const SERIES_COUNT = /^(\d[\d,]* series|No series)/;
  const libraryFrame = (): LibraryFrame => {
    const main = document.querySelector("main");
    const heading = main?.querySelector("h1");
    const tabs = main?.querySelector("[role='tablist']");
    const chosen = tabs?.querySelector("[role='tab'][aria-selected='true']");
    const counted = [...(main?.querySelectorAll("p") ?? [])].find((line) =>
      SERIES_COUNT.test(line.textContent.trim()),
    );
    const shownPage =
      main?.querySelector("[data-pager-page='chosen']") ?? main ?? undefined;
    const covers = [
      ...(shownPage?.querySelectorAll<HTMLAnchorElement>(
        "a[href^='/series/']",
      ) ?? []),
    ];
    const shownBox = main?.getBoundingClientRect();
    const firstShown = covers.find((cover) => {
      const box = cover.getBoundingClientRect();
      return (
        shownBox !== undefined &&
        box.height > 0 &&
        box.top >= shownBox.top &&
        box.bottom <= shownBox.bottom
      );
    });
    return {
      at: performance.now(),
      isLibraryShown:
        location.pathname === "/" && heading?.textContent.trim() === "Library",
      skeletonTiles:
        shownPage?.querySelectorAll(
          "[aria-busy='true'] > *:not([data-pager-page='beside'] *)",
        ).length ?? 0,
      covers: covers.length,
      hasTabs: tabs !== null && tabs !== undefined,
      chosenTab: chosen?.textContent.trim(),
      count: counted?.textContent.trim(),
      sections: main?.querySelectorAll("section[aria-labelledby]").length ?? 0,
      emptyTitle: shownPage
        ?.querySelector("[data-slot='empty-title']")
        ?.textContent.trim(),
      scrollTop: main?.scrollTop ?? 0,
      firstCover: firstShown?.getAttribute("href") ?? undefined,
    };
  };
  let isRecording = false;
  const eachFrame = (): void => {
    if (!isRecording) {
      return;
    }
    window.__omnileafLibraryFrames?.push(libraryFrame());
    setTimeout(() => {
      if (isRecording) {
        window.__omnileafLibraryFrames?.push(libraryFrame());
      }
    });
    requestAnimationFrame(eachFrame);
  };
  window.__omnileafLibraryFrame = libraryFrame;
  window.__omnileafRecordFrames = () => {
    window.__omnileafLibraryFrames = [];
    isRecording = true;
    requestAnimationFrame(eachFrame);
  };
  window.__omnileafStopFrames = () => {
    isRecording = false;
  };
  if (startsAtOnce) {
    window.__omnileafRecordFrames();
  }
}

export async function watchLibraryFrames(page: Page): Promise<void> {
  await page.addInitScript(installFrameRecorder, false);
}

export async function recordLibraryFramesFromTheStart(
  page: Page,
): Promise<void> {
  await page.addInitScript(installFrameRecorder, true);
}

export async function startRecordingFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__omnileafRecordFrames?.();
  });
}

export function libraryFrameNow(page: Page): Promise<LibraryFrame> {
  return page.evaluate(() => {
    const frame = window.__omnileafLibraryFrame?.();
    if (frame === undefined) {
      throw new Error("the page records no frames");
    }
    return frame;
  });
}

function framesSoFar(page: Page): Promise<LibraryFrame[]> {
  return page.evaluate(() => window.__omnileafLibraryFrames ?? []);
}

function isAtRest(frames: readonly LibraryFrame[]): boolean {
  const last = frames.slice(-QUIET_FRAMES);
  const [first] = last;
  return (
    last.length === QUIET_FRAMES &&
    first !== undefined &&
    last.every(
      (frame) =>
        frame.isLibraryShown &&
        JSON.stringify({ ...frame, at: 0 }) ===
          JSON.stringify({ ...first, at: 0 }),
    )
  );
}

/** Records until the Library has shown, every command has answered and nothing has changed for a while. */
export async function framesUntilAtRest(page: Page): Promise<LibraryFrame[]> {
  await expect
    .poll(
      async () =>
        (await commandsAsked(page)).unanswered === 0 &&
        isAtRest(await framesSoFar(page)),
      { timeout: LONGEST_SETTLE_MS },
    )
    .toBe(true);
  await page.evaluate(() => {
    window.__omnileafStopFrames?.();
  });
  return framesSoFar(page);
}

export function framesOnceShown(
  frames: readonly LibraryFrame[],
): LibraryFrame[] {
  const shownAt = frames.findIndex((frame) => frame.isLibraryShown);
  return shownAt === -1 ? [] : frames.slice(shownAt);
}

export function describeFrames(frames: readonly LibraryFrame[]): string {
  const start = frames[0]?.at ?? 0;
  let last = "";
  const lines: string[] = [];
  for (const frame of frames) {
    const shown = JSON.stringify({ ...frame, at: undefined });
    if (shown !== last) {
      lines.push(`${(frame.at - start).toFixed(0)} ms ${shown}`);
      last = shown;
    }
  }
  return lines.join("\n");
}

export async function slowTheCpu(page: Page): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", {
    rate: CPU_SLOWDOWN,
  });
  return session;
}

export async function touch(
  session: CDPSession,
  target: Locator,
): Promise<void> {
  const box = await boxOf(target);
  const finger = {
    id: FINGER_ID,
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [finger],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}
