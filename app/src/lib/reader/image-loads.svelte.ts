import {
  LONGEST_IMAGE_LOAD_MS,
  PAGES_LOADING_AT_ONCE,
  THUMBNAILS_LOADING_AT_ONCE,
} from "./page-requests.ts";

export class ImageLoads {
  readonly #most: number;
  #loading = $state(0);
  readonly #latestAsk = new WeakMap<HTMLImageElement, string>();

  constructor(most: number) {
    this.#most = most;
  }

  get room(): number {
    return this.#most - this.#loading;
  }

  /** Counts the image as loading until it loads or fails, even once it leaves the page, as neither Chromium nor WebKit drops an image's request when its element is removed. */
  load(
    image: HTMLImageElement,
    url: string,
    onStalled: () => void = () => undefined,
  ): void {
    if (image.getAttribute("src") === url) {
      return;
    }
    this.#loading += 1;
    this.#latestAsk.set(image, url);
    const settle = (): void => {
      clearTimeout(stalling);
      image.removeEventListener("load", settle);
      image.removeEventListener("error", settle);
      this.#loading -= 1;
    };
    const stalling = setTimeout(() => {
      settle();
      if (this.#isStillAsked(image, url)) {
        onStalled();
      }
    }, LONGEST_IMAGE_LOAD_MS);
    image.addEventListener("load", settle);
    image.addEventListener("error", settle);
    image.src = url;
  }

  #isStillAsked(image: HTMLImageElement, url: string): boolean {
    return image.isConnected && this.#latestAsk.get(image) === url;
  }
}

export const pageLoads = new ImageLoads(PAGES_LOADING_AT_ONCE);
export const thumbnailLoads = new ImageLoads(THUMBNAILS_LOADING_AT_ONCE);
