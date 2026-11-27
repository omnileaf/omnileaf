import type { Page, Request } from "@playwright/test";

import { fakeProtocolRoute } from "./fake-backend.ts";
import { AS_ANDROID_SERVES, servePages } from "./reader-book.ts";

export const ANSWER_MS = 300;

const PAGE_THUMBNAIL = /\/page-thumb\/v1\/[^/]+\/\d+\/(\d+)$/;

export class Traffic {
  readonly asked: number[] = [];
  readonly #inFlight = new Set<Request>();
  #most = 0;

  get inFlight(): number {
    return this.#inFlight.size;
  }

  get most(): number {
    return this.#most;
  }

  start(request: Request, index: number): void {
    this.asked.push(index);
    this.#inFlight.add(request);
    this.#most = Math.max(this.#most, this.#inFlight.size);
  }

  settle(request: Request): void {
    this.#inFlight.delete(request);
  }
}

export interface ReaderTraffic {
  readonly pages: Traffic;
  readonly thumbnails: Traffic;
}

function answerLater(): Promise<void> {
  return new Promise((answered) => setTimeout(answered, ANSWER_MS));
}

export async function servePagesSlowly(page: Page): Promise<ReaderTraffic> {
  const traffic = { pages: new Traffic(), thumbnails: new Traffic() };
  const settle = (request: Request): void => {
    traffic.pages.settle(request);
    traffic.thumbnails.settle(request);
  };
  page.on("requestfinished", settle);
  page.on("requestfailed", settle);
  await servePages(
    page,
    async (route, index) => {
      traffic.pages.start(route.request(), index);
      await answerLater();
    },
    AS_ANDROID_SERVES,
  );
  await page.route(fakeProtocolRoute("omni"), async (route) => {
    const thumbnailOf = PAGE_THUMBNAIL.exec(route.request().url())?.[1];
    if (thumbnailOf !== undefined) {
      traffic.thumbnails.start(route.request(), Number(thumbnailOf));
      await answerLater();
    }
    await route.fallback();
  });
  return traffic;
}
